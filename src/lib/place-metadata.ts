export type PlaceReview = {
  text: string;
  rating?: number;
};

export type PlaceMetadata = {
  types: string[];
  editorialOverview: string | null;
  reviews: PlaceReview[];
};

export type FetchPlaceMetadataOptions = {
  apiKey: string;
  fetcher?: typeof fetch;
};

const GENERIC_TYPES = new Set([
  "point_of_interest",
  "establishment",
  "food",
  "store",
  "premise",
  "political",
  "geocode",
]);

const GENERIC_TYPE_LABELS = new Set([
  "takeaway",
  "delivery",
  "restaurant",
  "fast food",
  "food court",
]);

const TYPE_LABELS: Record<string, string> = {
  indian_restaurant: "Indian",
  chinese_restaurant: "Chinese",
  italian_restaurant: "Italian",
  japanese_restaurant: "Japanese",
  mexican_restaurant: "Mexican",
  thai_restaurant: "Thai",
  french_restaurant: "French",
  greek_restaurant: "Greek",
  mediterranean_restaurant: "Mediterranean",
  middle_eastern_restaurant: "Middle Eastern",
  korean_restaurant: "Korean",
  american_restaurant: "American",
  seafood_restaurant: "Seafood",
  vegetarian_restaurant: "Vegetarian",
  vegan_restaurant: "Vegan",
  fast_food_restaurant: "Fast food",
  fine_dining_restaurant: "Fine dining",
  bakery: "Bakery",
  cafe: "Cafe",
  bar: "Bar",
  meal_takeaway: "Takeaway",
  meal_delivery: "Delivery",
  ice_cream_shop: "Ice cream",
  dessert_shop: "Desserts",
  coffee_shop: "Coffee",
  tea_house: "Tea house",
  sandwich_shop: "Sandwiches",
  pizza_restaurant: "Pizza",
  hamburger_restaurant: "Burgers",
  brunch_restaurant: "Brunch",
  buffet_restaurant: "Buffet",
  food_court: "Food court",
  confectionery: "Sweets",
};

const FOOD_KEYWORDS =
  /\b(thali|samosa|chaat|dosa|biryani|wazwan|kashmiri|gujarati|pizza|burger|pasta|curry|curries|chai|coffee|bakery|farsan|snacks|street food|walnut fudge|kulfi|lassi|kebab|paratha|pav bhaji|vada pav|misal|pani puri|bhel|ice cream|dessert|seafood|sushi|tacos|ramen|noodles|beverages|mocktails)\b/gi;

const MAX_SUMMARY_LENGTH = 72;

const REJECT_PHRASE =
  /\b(this place|that place|thank you|staff|advocate|so much that|and also|got it pack|suggest b)\b/i;

const TESTIMONIAL_PHRASE =
  /\b(I|I've|I'm|I'd|my|we|our|me|you|your|they|their|had in|I've had|when I|used to|please go|love|loved|recommend|awesome|amazing|definitely try|don't miss|vibey|kickass)\b/i;

export async function fetchPlaceMetadata(
  placeId: string,
  options: FetchPlaceMetadataOptions,
): Promise<PlaceMetadata | null> {
  const fetcher = options.fetcher ?? fetch;
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
    placeId,
  )}&fields=types,editorial_summary,reviews&key=${encodeURIComponent(options.apiKey)}`;
  const response = await fetcher(url);
  const data = (await response.json()) as {
    result?: {
      types?: string[];
      editorial_summary?: { overview?: string };
      reviews?: Array<{ text?: string; rating?: number }>;
    };
    status?: string;
  };

  if (!data.result) return null;

  return {
    types: data.result.types ?? [],
    editorialOverview: data.result.editorial_summary?.overview?.trim() ?? null,
    reviews: (data.result.reviews ?? [])
      .map((review) => ({
        text: review.text?.trim() ?? "",
        rating: review.rating,
      }))
      .filter((review) => review.text.length > 0),
  };
}

export function typesToPlaceLabels(types: string[]): string[] {
  const labels: string[] = [];

  for (const type of types) {
    if (GENERIC_TYPES.has(type)) continue;
    const mapped = TYPE_LABELS[type];
    if (mapped) {
      labels.push(mapped);
      continue;
    }
    if (type.endsWith("_restaurant")) {
      const cuisine = type.replace(/_restaurant$/, "").replace(/_/g, " ");
      if (cuisine.length > 2) {
        labels.push(cuisine.charAt(0).toUpperCase() + cuisine.slice(1));
      }
    }
  }

  return uniqueLabels(labels);
}

export function derivePlaceLabels(metadata: PlaceMetadata): string[] {
  return typesToPlaceLabels(metadata.types).slice(0, 4);
}

export function extractFamousForFromReviews(reviews: PlaceReview[]): string | null {
  if (!reviews.length) return null;

  const combined = reviews.map((review) => review.text).join(" ");

  const keywordHits = new Map<string, number>();
  for (const match of combined.matchAll(FOOD_KEYWORDS)) {
    const term = match[0].toLowerCase();
    keywordHits.set(term, (keywordHits.get(term) ?? 0) + 1);
  }

  const topKeywords = [...keywordHits.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2);

  if (topKeywords.length >= 2) {
    const totalHits = topKeywords.reduce((sum, [, count]) => sum + count, 0);
    if (totalHits >= 3) {
      return `Known for ${topKeywords.map(([term]) => titleCaseFood(term)).join(" & ")}`;
    }
  }

  const phrases: string[] = [];
  const patterns = [
    /(?:famous|known|popular)\s+for\s+([^.!?\n]{4,60})/gi,
    /must\s+try\s+(?:the\s+)?([^.!?\n]{4,50})/gi,
    /\bbest\s+([^.!?\n]{4,40})/gi,
  ];

  for (const pattern of patterns) {
    for (const match of combined.matchAll(pattern)) {
      const cleaned = cleanFamousPhrase(match[1]);
      if (cleaned) phrases.push(cleaned);
    }
  }

  if (phrases.length) {
    const best = pickBestPhrase(phrases);
    if (best) return best;
  }

  if (topKeywords.length) {
    return `Known for ${topKeywords.map(([term]) => titleCaseFood(term)).join(" & ")}`;
  }

  return null;
}

export function extractFamousForFromEditorial(overview: string | null): string | null {
  if (!overview) return null;

  for (const pattern of [
    /(?:famous|known|popular)\s+for\s+([^.!?\n]{4,60})/i,
    /(?:serving|specializing in)\s+([^.!?\n]{4,60})/i,
  ]) {
    const match = overview.match(pattern);
    if (match?.[1]) {
      const cleaned = cleanFamousPhrase(match[1]);
      if (cleaned) return cleaned;
    }
  }

  const sentence = overview.split(/[.!?]/)[0]?.trim();
  if (!sentence || sentence.length < 12 || REJECT_PHRASE.test(sentence)) return null;
  if (!containsFoodKeyword(sentence)) return null;

  const shortened = sentence.length > 55 ? `${sentence.slice(0, 52).trim()}…` : sentence;
  return shortened;
}

export function extractFamousFor(metadata: PlaceMetadata): string | null {
  return (
    extractFamousForFromReviews(metadata.reviews) ??
    extractFamousForFromEditorial(metadata.editorialOverview)
  );
}

export function formatCuisineSummary(metadata: PlaceMetadata): string | null {
  const typeLabels = derivePlaceLabels(metadata).slice(0, 3);
  const typePart = typeLabels.length ? typeLabels.join(" · ") : null;
  const famous = extractFamousFor(metadata);
  const famousPhrase = famous && !isTestimonialPhrase(famous) ? famous : null;

  if (typePart && famousPhrase && isOnlyGenericTypes(typeLabels)) {
    return famousForSummary(famousPhrase);
  }

  if (typePart && famousPhrase) {
    return clampSummary(`${typePart} · ${stripKnownForPrefix(famousPhrase)}`);
  }

  if (typePart) return clampSummary(typePart);
  if (famousPhrase) return famousForSummary(famousPhrase);
  return null;
}

function isOnlyGenericTypes(labels: string[]) {
  return labels.length > 0 && labels.every((label) => GENERIC_TYPE_LABELS.has(label.toLowerCase()));
}

function cleanFamousPhrase(value: string) {
  let phrase = value
    .replace(/\s+/g, " ")
    .replace(/^(the|their|its|a|an|and)\s+/i, "")
    .trim();

  phrase = phrase.split(/[,;]/)[0]?.trim() ?? phrase;
  if (phrase.length < 4 || REJECT_PHRASE.test(phrase) || isTestimonialPhrase(phrase)) return null;
  if (!containsFoodKeyword(phrase) && phrase.split(/\s+/).length > 4) return null;
  if (phrase.split(/\s+/).length > 6) return null;
  if (phrase.length > 40) phrase = phrase.slice(0, 37).trim() + "…";
  return phrase;
}

function isTestimonialPhrase(value: string) {
  return TESTIMONIAL_PHRASE.test(value) || /\bin\s+[A-Z][a-z]+\s*$/i.test(value);
}

function pickBestPhrase(phrases: string[]) {
  const scored = phrases
    .filter((phrase) => containsFoodKeyword(phrase) && !REJECT_PHRASE.test(phrase))
    .map((phrase) => ({
      phrase,
      score: Math.min(phrase.length, 30) / 10,
    }));
  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.phrase ?? null;
}

function titleCaseFood(term: string) {
  return term.replace(/\b\w/g, (char) => char.toUpperCase());
}

function containsFoodKeyword(text: string) {
  return new RegExp(FOOD_KEYWORDS.source, "i").test(text);
}

function clampSummary(value: string) {
  return value.length > MAX_SUMMARY_LENGTH ? `${value.slice(0, MAX_SUMMARY_LENGTH - 1).trim()}…` : value;
}

function stripKnownForPrefix(value: string) {
  return value.replace(/^known for\s+/i, "").trim();
}

function famousForSummary(famous: string) {
  const trimmed = famous.trim();
  if (/^known for\b/i.test(trimmed)) return clampSummary(trimmed);
  return clampSummary(`Known for ${trimmed}`);
}

function uniqueLabels(labels: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const label of labels) {
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}
