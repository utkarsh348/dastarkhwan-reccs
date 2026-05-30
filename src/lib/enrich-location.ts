import { getEnv } from "./env";
import { resolveLocation } from "./geocode";
import { buildCuisineSummary } from "./cuisine-summary";
import { fetchPlaceMetadata } from "./place-metadata";
import type { RecommendationInput } from "./types";
import { sanitizeRecommendationContent } from "./weak-content";

export async function enrichWithLocation(input: RecommendationInput): Promise<RecommendationInput> {
  const apiKey = getEnv("GOOGLE_MAPS_SERVER_KEY");
  let merged = { ...input };

  if (apiKey) {
    const location = await resolveLocation(input, { apiKey });
    merged = {
      ...merged,
      latitude: location.latitude ?? merged.latitude ?? null,
      longitude: location.longitude ?? merged.longitude ?? null,
      googlePlaceId: location.googlePlaceId ?? merged.googlePlaceId ?? null,
      googleMapsUrl: location.googleMapsUrl ?? merged.googleMapsUrl ?? null,
      locationStatus: location.locationStatus,
      locationConfidence: location.locationConfidence,
      address: location.address ?? merged.address ?? null,
    };
  }

  const placeId = merged.googlePlaceId;
  if (apiKey && placeId) {
    const metadata = await fetchPlaceMetadata(placeId, { apiKey });
    if (metadata) {
      merged.cuisineSummary = buildCuisineSummary(metadata) ?? merged.cuisineSummary ?? null;
    }
  }

  return sanitizeRecommendationContent(merged);
}
