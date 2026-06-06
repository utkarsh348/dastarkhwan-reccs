import { extractGoogleMapsUrls } from "../location";
import { firstName, slugify, stableHash, titleCase } from "../slug";
import { multiPlaceInputsFromBody } from "./multi-place";
import type { ExtractedRecommendationCandidate } from "./schemas";
import type { WhatsAppMessage } from "./whatsapp";

export function extractRecommendationCandidates(messages: WhatsAppMessage[]): ExtractedRecommendationCandidate[] {
  let activeCity: string | null = null;
  const candidates: ExtractedRecommendationCandidate[] = [];

  for (const message of messages) {
    const cityFromContext = inferContextCity(message.body);
    if (cityFromContext) {
      activeCity = cityFromContext;
      continue;
    }

    const extracted = extractCandidatesFromMessage(message, activeCity);
    candidates.push(...extracted);
  }

  return candidates;
}

function extractCandidatesFromMessage(
  message: WhatsAppMessage,
  activeCity: string | null,
): ExtractedRecommendationCandidate[] {
  const body = message.body.replace(/\s+/g, " ").trim();
  const mapsUrl = extractGoogleMapsUrls(body)[0] ?? null;
  const explicitCity = inferExplicitCity(body);
  const city = explicitCity ?? activeCity ?? "Unsorted";
  const source = firstName(message.sender);

  const listed = extractListCandidates(message, city, source);
  if (listed.length > 0) return listed;

  const moon = extractMoonlight(body);
  if (moon) return [createCandidate(message, city, source, moon, mapsUrl, 0.92)];

  const chai = body.match(/^\s*Chai\s+Jaai\s*-\s*(?<note>.+)$/i);
  if (chai?.groups) {
    return [
      createCandidate(
        message,
        city,
        source,
        {
          restaurant: "Chai Jaai",
          dishes: ["kashmiri beverages", "snacks"],
          tags: ["beverages", "snacks"],
          note: sentence(chai.groups.note),
        },
        mapsUrl,
        0.9,
      ),
    ];
  }

  const ahdoos = body.match(/\bAhdoos\b(?<note>.*)/i);
  if (ahdoos?.groups) {
    return [
      createCandidate(
        message,
        city,
        source,
        {
          restaurant: "Ahdoos",
          dishes: body.toLowerCase().includes("wazwan") ? ["wazwan"] : [],
          tags: ["restaurant"],
          note: sentence(`Ahdoos${ahdoos.groups.note}`),
        },
        mapsUrl,
        0.88,
      ),
    ];
  }

  const multiPlace = multiPlaceInputsFromBody(body);
  if (multiPlace?.length) {
    return multiPlace.map((input) =>
      createCandidate({ ...message, body: input.note }, city, source, input, mapsUrl, 0.82),
    );
  }

  const calledPlace = body.match(/\bcalled\s+(?<restaurant>[A-Z][\p{L}'& ]{2,}?)(?:\s+only|[.!,-]|$)/iu);
  const thereIsPlace = body.includes("called")
    ? null
    : body.match(/\bthere is\s+(?<restaurant>[A-Z][\p{L}'& ]{2,}?)(?:\s+only|[.!,-]|$)/iu);
  const namedPlace = calledPlace ?? thereIsPlace;
  if (namedPlace?.groups && !isNonRecommendationLine(namedPlace.groups.restaurant)) {
    return [
      createCandidate(
        message,
        city,
        source,
        {
          restaurant: titleCase(namedPlace.groups.restaurant),
          dishes: inferDishes(body),
          tags: inferTags(body),
          note: sentence(body),
        },
        mapsUrl,
        0.74,
      ),
    ];
  }

  const tryPlace = body.match(/\b(?:try|go to|have (?:the )?thali at)\s+(?<restaurant>[A-Z][\p{L}'& ]{2,}?)(?:\s+thali|\s+ice creams|\s+also|[.!-]|$)/iu);
  if (tryPlace?.groups && !isNonRecommendationLine(tryPlace.groups.restaurant)) {
    return [
      createCandidate(
        message,
        city,
        source,
        {
          restaurant: titleCase(tryPlace.groups.restaurant),
          dishes: inferDishes(body),
          tags: inferTags(body),
          note: sentence(body),
        },
        mapsUrl,
        0.72,
      ),
    ];
  }

  const forCuisinePlace = body.match(
    /^For\s+[^,]{2,},\s+(?<restaurant>[A-Z][\p{L}\p{N}'& .]{2,}?)(?:\s+(?:on|in|at)\b|\s+is\b)/u,
  );
  if (forCuisinePlace?.groups && !isNonRecommendationLine(forCuisinePlace.groups.restaurant)) {
    return [
      createCandidate(
        message,
        city,
        source,
        {
          restaurant: titleCase(forCuisinePlace.groups.restaurant),
          dishes: inferDishes(body),
          tags: inferTags(body),
          note: sentence(body),
        },
        mapsUrl,
        0.74,
      ),
    ];
  }

  const hyphen = body.match(/^(?<restaurant>[A-Z][\p{L}\p{N}'& .]+?)\s+-\s+(?<rest>.+)$/u);
  if (hyphen?.groups && !/need|looking|recco|recommend/i.test(hyphen.groups.restaurant) && !isCategoryHeading(hyphen.groups.restaurant)) {
    const address = inferAddress(hyphen.groups.rest);
    return [
      createCandidate(
        message,
        city,
        source,
        {
          restaurant: titleCase(hyphen.groups.restaurant),
          dishes: inferDishes(body),
          tags: inferTags(body),
          note: sentence(hyphen.groups.rest),
          address,
          area: inferArea(body),
        },
        mapsUrl,
        0.78,
      ),
    ];
  }

  return [];
}

function extractListCandidates(
  message: WhatsAppMessage,
  city: string,
  source: string,
): ExtractedRecommendationCandidate[] {
  const lines = message.body
    .split(/\r?\n/)
    .map((line) => cleanListLine(line))
    .filter(Boolean);
  if (lines.length < 2) return [];

  let category = "";
  const candidates: ExtractedRecommendationCandidate[] = [];
  for (const line of lines) {
    if (isCategoryHeading(line)) {
      category = line;
      continue;
    }

    const parsed = parseRestaurantListLine(line);
    if (!parsed) continue;

    const lineMessage = { ...message, body: line };
    const combined = `${category} ${line}`;
    candidates.push(
      createCandidate(
        lineMessage,
        city,
        source,
        {
          restaurant: parsed.restaurant,
          area: parsed.area,
          note: parsed.note,
          dishes: unique([...inferDishes(combined), ...parsed.dishes]),
          tags: unique([...inferTags(combined), ...parsed.tags]),
        },
        extractGoogleMapsUrls(line)[0] ?? null,
        0.76,
      ),
    );
  }
  return candidates;
}

function parseRestaurantListLine(line: string):
  | { restaurant: string; note: string; area: string | null; dishes: string[]; tags: string[] }
  | null {
  const withoutNumber = line.replace(/^\s*(?:\d+\.|[-*ÔÇó])\s*/, "").replace(/^\*|\*$/g, "").trim();
  if (!withoutNumber || isCategoryHeading(withoutNumber) || /message was edited|image omitted/i.test(withoutNumber)) {
    return null;
  }
  if (isNonRecommendationLine(withoutNumber)) return null;

  const paren = withoutNumber.match(/^(?<restaurant>[A-Z][\p{L}\p{N}'& .-]{2,}?)(?:\s*\((?<note>.+)\))$/u);
  if (paren?.groups) {
    return {
      restaurant: titleCase(paren.groups.restaurant.replace(/[:\-]+$/, "")),
      note: sentence(paren.groups.note),
      area: inferArea(paren.groups.note),
      dishes: inferDishes(paren.groups.note),
      tags: inferTags(paren.groups.note),
    };
  }

  const simple = withoutNumber.match(/^(?<restaurant>[A-Z][\p{L}\p{N}'& .-]{2,})(?::)?$/u);
  if (simple?.groups && withoutNumber.split(/\s+/).length <= 5 && !/[.!?]/.test(withoutNumber)) {
    return {
      restaurant: titleCase(simple.groups.restaurant.replace(/[:\-]+$/, "")),
      note: sentence(withoutNumber),
      area: inferArea(withoutNumber),
      dishes: inferDishes(withoutNumber),
      tags: inferTags(withoutNumber),
    };
  }

  return null;
}

function cleanListLine(line: string): string {
  return line.replace(/<This message was edited>/gi, "").replace(/\u2060/g, "").trim();
}

function isCategoryHeading(value: string): boolean {
  const cleaned = value.replace(/[-:]+$/, "").trim().toLowerCase();
  return /^(for .*|good .*|best .*|late night.*|thalis?|sea ?food|morning breakfast|if you don't mind.*)$/.test(
    cleaned,
  );
}

function isNonRecommendationLine(value: string): boolean {
  const text = value.trim();
  return /^(again|its? days|banned|please|ignore|be careful|manek chowk is done|love |actually |also surprised|old city|especially|their|the |some |best |great )/i.test(
    text,
  );
}

function createCandidate(
  message: WhatsAppMessage,
  city: string,
  sourceName: string,
  input: {
    restaurant: string;
    dishes?: string[];
    tags?: string[];
    note?: string | null;
    address?: string | null;
    area?: string | null;
  },
  googleMapsUrl: string | null,
  confidence: number,
): ExtractedRecommendationCandidate {
  const cityName = city === "Unsorted" ? city : titleCase(city);
  const restaurant = normalizeRestaurantName(input.restaurant);
  const restaurantSlug = slugify(restaurant);
  const citySlug = slugify(cityName);
  const snippet = truncateSnippet(message.body);

  return {
    restaurant,
    restaurantSlug,
    city: cityName,
    citySlug,
    area: input.area ?? inferArea(message.body),
    address: input.address ?? inferAddress(message.body),
    dishes: unique((input.dishes ?? inferDishes(message.body)).map((dish) => dish.toLowerCase())),
    tags: unique(input.tags ?? inferTags(message.body)),
    note: input.note ?? sentence(message.body),
    snippet,
    sourceName,
    confidence,
    googleMapsUrl,
    sourceDate: message.timestamp.toISOString(),
    rawRefLabel: `lines ${message.lineStart}-${message.lineEnd}`,
    sourceHash: stableHash([restaurantSlug, citySlug, sourceName, snippet, message.timestamp.toISOString()]),
  };
}

function inferContextCity(body: string): string | null {
  const match = body.match(/\b(?:in|for|around)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/i);
  if (!match?.[1]) return null;
  if (!/(recco|rec|recommend|food|restaurant|breakfast|lunch|dinner|bakery|wazwan)/i.test(body)) return null;
  const city = titleCase(match[1].replace(/[?.!,]+$/, ""));
  const cleaned = city.replace(/\s+(Here|For|With|Please|Anything)$/i, "");
  if (isCategoryHeading(cleaned)) return null;
  return cleaned;
}

function inferExplicitCity(body: string): string | null {
  const known = ["Srinagar", "Delhi", "Mumbai", "Bengaluru", "Bangalore", "Hyderabad", "Chennai", "Kolkata"];
  return known.find((city) => new RegExp(`\\b${city}\\b`, "i").test(body)) ?? null;
}

function extractMoonlight(body: string) {
  if (!/moon\s*light|moonlight/i.test(body)) return null;
  return {
    restaurant: "Moon Light / Moonlight Bakery",
    dishes: body.toLowerCase().includes("walnut fudge") ? ["walnut fudge"] : [],
    tags: ["bakery"],
    note: sentence(body),
    address: inferAddress(body),
    area: inferArea(body),
  };
}

function inferDishes(body: string): string[] {
  const lower = body.toLowerCase();
  const dishes = [
    ["walnut fudge", /walnut\s+fudge/],
    ["wazwan", /wazwan/],
    ["kashmiri beverages", /kashmiri\s+beverages/],
    ["snacks", /snacks?/],
  ] as const;

  return dishes.filter(([, pattern]) => pattern.test(lower)).map(([dish]) => dish);
}

function inferTags(body: string): string[] {
  const lower = body.toLowerCase();
  const tags: string[] = [];
  if (/bakery|fudge/.test(lower)) tags.push("bakery");
  if (/beverage|chai|coffee|tea/.test(lower)) tags.push("beverages");
  if (/wazwan/.test(lower)) tags.push("wazwan");
  if (/snacks?/.test(lower)) tags.push("snacks");
  return unique(tags);
}

function inferArea(body: string): string | null {
  const area = body.match(/\b(Hazaratbal|Hazratbal|University Main Road|New Shopping Complex)\b/i)?.[1];
  return area ? titleCase(area) : null;
}

function inferAddress(body: string): string | null {
  const cityIndex = body.search(/\bSrinagar\b/i);
  if (cityIndex === -1) return null;
  const beforeCity = body.slice(0, cityIndex + "Srinagar".length);
  if (!/,/.test(beforeCity)) return null;
  return beforeCity.replace(/^[^,]+,\s*/, "").trim();
}

function sentence(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}

function truncateSnippet(value: string): string {
  return sentence(value).slice(0, 180);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeRestaurantName(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (/moon\s*light|moonlight/i.test(cleaned)) return "Moon Light / Moonlight Bakery";
  return cleaned;
}

