import type { LocationStatus, RecommendationInput } from "./types";

const supportedStatuses: LocationStatus[] = [
  "resolved_from_link",
  "resolved_from_places",
  "manual",
  "needs_lookup",
  "ambiguous",
];

export function normalizeLocationStatus(status: string | null | undefined): LocationStatus {
  if (supportedStatuses.includes(status as LocationStatus)) {
    return status as LocationStatus;
  }

  return "needs_lookup";
}

export function extractGoogleMapsUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.[^\s]+\/maps|google\.[^\s]+\/maps)[^\s)>\]]+/gi);
  return [...new Set((matches ?? []).map((url) => url.replace(/[.,;]+$/, "")))];
}

export function buildLocationQuery(input: Pick<RecommendationInput, "restaurant" | "city" | "area" | "address">): string {
  const restaurant = input.restaurant.trim();
  if (input.address?.trim()) {
    return `${restaurant}, ${input.address.trim()}`;
  }

  return [restaurant, input.area, input.city]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

export function buildGoogleMapsSearchUrl(restaurant: string, city?: string | null, area?: string | null): string {
  const query = [restaurant, area, city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function hasCoordinates(input: Pick<RecommendationInput, "latitude" | "longitude">): boolean {
  return typeof input.latitude === "number" && typeof input.longitude === "number";
}

export function normalizeMapsUrl(input: RecommendationInput): string | null {
  if (input.googleMapsUrl?.trim()) return input.googleMapsUrl.trim();
  return buildGoogleMapsSearchUrl(input.restaurant, input.city, input.area);
}
