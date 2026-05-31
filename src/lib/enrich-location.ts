import { getEnv } from "./env";
import { resolveLocation } from "./geocode";
import { buildCuisineSummary } from "./cuisine-summary";
import { isGoogleMapsSkipGeocode } from "./google-maps-budget";
import { isLockedRecommendation } from "./importer/locked-recommendation";
import { fetchPlaceMetadata } from "./place-metadata";
import type { RecommendationInput } from "./types";
import { sanitizeRecommendationContent } from "./weak-content";

export type EnrichWithLocationOptions = {
  /** Skip Text Search / geocode Place Details even when coordinates are missing. */
  skipGeocode?: boolean;
  /** When geocoding, only resolve rows that pass isLockedRecommendation. */
  geocodeLockedOnly?: boolean;
};

function isLocationAlreadyResolved(input: RecommendationInput): boolean {
  if (input.locationStatus === "resolved_from_places" || input.locationStatus === "resolved_from_link") {
    return true;
  }
  return Boolean(input.googlePlaceId && input.latitude != null && input.longitude != null);
}

function shouldAttemptGeocode(
  input: RecommendationInput,
  options: EnrichWithLocationOptions,
): boolean {
  if (options.skipGeocode || isGoogleMapsSkipGeocode()) return false;
  if (isLocationAlreadyResolved(input)) return false;
  if (options.geocodeLockedOnly && !isLockedRecommendation(input)) return false;
  return true;
}

export async function enrichWithLocation(
  input: RecommendationInput,
  options: EnrichWithLocationOptions = {},
): Promise<RecommendationInput> {
  const apiKey = getEnv("GOOGLE_MAPS_SERVER_KEY");
  let merged = { ...input };

  if (apiKey && shouldAttemptGeocode(input, options)) {
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
