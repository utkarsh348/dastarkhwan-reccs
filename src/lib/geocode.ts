import { recordGoogleMapsRequest } from "./google-maps-budget";
import { buildGoogleMapsSearchUrl, buildLocationQuery } from "./location";
import type { LocationStatus, RecommendationInput } from "./types";

export type ResolveLocationOptions = {
  apiKey: string;
  fetcher?: typeof fetch;
};

export type ResolvedLocation = {
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
  googleMapsUrl: string | null;
  locationStatus: LocationStatus;
  locationConfidence: number;
  address: string | null;
};

type PlaceResult = {
  name?: string;
  formatted_address?: string;
  place_id?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
};

type PlacesTextSearchResponse = {
  results?: PlaceResult[];
  status?: string;
};

type PlaceDetailsResponse = {
  result?: PlaceResult;
  status?: string;
};

const MIN_MATCH_SCORE = 0.42;

const textSearchCache = new Map<string, PlaceResult[]>();
const placeDetailsCache = new Map<string, ResolvedLocation | null>();

export function resetGeocodeCache(): void {
  textSearchCache.clear();
  placeDetailsCache.clear();
}

export async function resolveLocation(
  input: Pick<RecommendationInput, "restaurant" | "city" | "area" | "address" | "googleMapsUrl">,
  options: ResolveLocationOptions,
): Promise<ResolvedLocation> {
  const fetcher = options.fetcher ?? fetch;

  if (input.googleMapsUrl) {
    const linkedCoordinates = extractCoordinatesFromMapsUrl(input.googleMapsUrl);
    if (linkedCoordinates) {
      return {
        latitude: linkedCoordinates.latitude,
        longitude: linkedCoordinates.longitude,
        googlePlaceId: extractPlaceIdFromMapsUrl(input.googleMapsUrl),
        googleMapsUrl: input.googleMapsUrl,
        locationStatus: "resolved_from_link",
        locationConfidence: 0.95,
        address: input.address ?? null,
      };
    }

    const placeId = extractPlaceIdFromMapsUrl(input.googleMapsUrl);
    if (placeId) {
      const cached = placeDetailsCache.get(placeId);
      if (cached !== undefined) {
        return {
          ...cached,
          googleMapsUrl: input.googleMapsUrl,
          address: cached.address ?? input.address ?? null,
        };
      }

      const fromDetails = await fetchPlaceDetails(placeId, options.apiKey, fetcher);
      if (fromDetails) {
        return {
          ...fromDetails,
          googleMapsUrl: input.googleMapsUrl,
          address: fromDetails.address ?? input.address ?? null,
        };
      }
    }
  }

  const queries = buildSearchQueries(input);
  for (const query of queries) {
    const results = await textSearch(query, options.apiKey, fetcher);
    const resolved = resolveFromResults(results, input, query);
    if (resolved) return resolved;
  }

  return unresolved(input);
}

export function scorePlaceMatch(
  result: PlaceResult,
  input: Pick<RecommendationInput, "restaurant" | "city" | "area">,
): number {
  const restaurant = normalizeForMatch(input.restaurant);
  const city = normalizeForMatch(input.city ?? "");
  const haystack = normalizeForMatch(
    [result.name, result.formatted_address].filter(Boolean).join(" "),
  );

  if (!haystack || !restaurant) return 0;

  let score = 0;
  if (haystack.includes(restaurant)) score += 0.55;
  else {
    const restaurantTokens = restaurant.split(/\s+/).filter((token) => token.length > 2);
    const matched = restaurantTokens.filter((token) => haystack.includes(token)).length;
    score += restaurantTokens.length ? (matched / restaurantTokens.length) * 0.45 : 0;
  }

  if (city && haystack.includes(city)) score += 0.3;
  if (input.area) {
    const area = normalizeForMatch(input.area);
    if (area && haystack.includes(area)) score += 0.15;
  }

  return Math.min(score, 1);
}

export function pickBestPlaceResult(
  results: PlaceResult[],
  input: Pick<RecommendationInput, "restaurant" | "city" | "area">,
): { result: PlaceResult; score: number } | null {
  let best: { result: PlaceResult; score: number } | null = null;
  for (const result of results) {
    const score = scorePlaceMatch(result, input);
    if (!best || score > best.score) best = { result, score };
  }
  if (!best || best.score < MIN_MATCH_SCORE) return null;
  return best;
}

function buildSearchQueries(
  input: Pick<RecommendationInput, "restaurant" | "city" | "area" | "address">,
): string[] {
  const full = buildLocationQuery(input);
  const withCity = [input.restaurant, input.area, input.city]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
  const cityOnly = [input.restaurant, input.city]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");

  return [...new Set([full, withCity, cityOnly].filter(Boolean))];
}

async function textSearch(query: string, apiKey: string, fetcher: typeof fetch): Promise<PlaceResult[]> {
  const cached = textSearchCache.get(query);
  if (cached !== undefined) return cached;

  if (!recordGoogleMapsRequest("text_search")) return [];

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    query,
  )}&key=${encodeURIComponent(apiKey)}`;
  const response = await fetcher(url);
  const data = (await response.json()) as PlacesTextSearchResponse;
  const results = data.results ?? [];
  textSearchCache.set(query, results);
  return results;
}

async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<ResolvedLocation | null> {
  const cached = placeDetailsCache.get(placeId);
  if (cached !== undefined) return cached;

  if (!recordGoogleMapsRequest("place_details_geocode")) return null;

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
    placeId,
  )}&fields=place_id,name,formatted_address,geometry&key=${encodeURIComponent(apiKey)}`;
  const response = await fetcher(url);
  const data = (await response.json()) as PlaceDetailsResponse;
  const result = data.result;
  if (!result) {
    placeDetailsCache.set(placeId, null);
    return null;
  }

  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") {
    placeDetailsCache.set(placeId, null);
    return null;
  }

  const resolved: ResolvedLocation = {
    latitude: lat,
    longitude: lng,
    googlePlaceId: result.place_id ?? placeId,
    googleMapsUrl: null,
    locationStatus: "resolved_from_places",
    locationConfidence: 0.92,
    address: result.formatted_address ?? null,
  };
  placeDetailsCache.set(placeId, resolved);
  return resolved;
}

function resolveFromResults(
  results: PlaceResult[],
  input: Pick<RecommendationInput, "restaurant" | "city" | "area" | "address" | "googleMapsUrl">,
  query: string,
): ResolvedLocation | null {
  if (!results.length) return null;

  const candidate =
    results.length === 1
      ? { result: results[0], score: scorePlaceMatch(results[0], input) }
      : pickBestPlaceResult(results, input);

  if (!candidate || candidate.score < MIN_MATCH_SCORE) return null;

  const { result } = candidate;
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const placeId = result.place_id ?? null;
  return {
    latitude: lat,
    longitude: lng,
    googlePlaceId: placeId,
    googleMapsUrl:
      input.googleMapsUrl ??
      (placeId
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(placeId)}`
        : buildGoogleMapsSearchUrl(input.restaurant, input.city, input.area)),
    locationStatus: "resolved_from_places",
    locationConfidence: Math.min(0.65 + candidate.score * 0.3, 0.95),
    address: result.formatted_address ?? input.address ?? null,
  };
}

function unresolved(
  input: Pick<RecommendationInput, "restaurant" | "city" | "area" | "address" | "googleMapsUrl">,
): ResolvedLocation {
  return {
    latitude: null,
    longitude: null,
    googlePlaceId: null,
    googleMapsUrl: input.googleMapsUrl ?? buildGoogleMapsSearchUrl(input.restaurant, input.city, input.area),
    locationStatus: "needs_lookup",
    locationConfidence: 0,
    address: input.address ?? null,
  };
}

function normalizeForMatch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractPlaceIdFromMapsUrl(url: string): string | null {
  const decoded = decodeURIComponent(url);
  const match = decoded.match(/query_place_id=([^&]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function extractCoordinatesFromMapsUrl(url: string) {
  const decoded = decodeURIComponent(url);
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:,|\/|$)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:&|$)/,
  ];

  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;

    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}
