import { getEnv } from "./env";

const DEFAULT_MAX_REQUESTS = 500;

let requestCount = 0;
let limitReachedLogged = false;
let skipGeocodeLogged = false;

export type GoogleMapsEndpoint = "text_search" | "place_details_geocode" | "place_details_metadata";

export function getGoogleMapsMaxRequests(): number {
  const raw = getEnv("GOOGLE_MAPS_MAX_REQUESTS") ?? getEnv("IMPORT_GEOCODE_MAX");
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_MAX_REQUESTS;
}

export function isGoogleMapsSkipGeocode(): boolean {
  return process.env.IMPORT_SKIP_GEOCODE === "true";
}

export function resetGoogleMapsRequestCount(): void {
  requestCount = 0;
  limitReachedLogged = false;
  skipGeocodeLogged = false;
}

export function getGoogleMapsRequestCount(): number {
  return requestCount;
}

/** Returns false when the request was blocked (skip flag or budget exhausted). */
export function recordGoogleMapsRequest(endpoint: GoogleMapsEndpoint): boolean {
  void endpoint;

  if (isGoogleMapsSkipGeocode()) {
    logSkipGeocodeOnce();
    return false;
  }

  const limit = getGoogleMapsMaxRequests();
  if (requestCount >= limit) {
    logLimitReachedOnce(limit);
    return false;
  }

  requestCount += 1;
  return true;
}

export function logGoogleMapsBudgetSummary(): void {
  const limit = getGoogleMapsMaxRequests();
  if (isGoogleMapsSkipGeocode()) {
    console.log(`Google Maps API calls used: 0 / ${limit} (geocoding skipped)`);
    return;
  }
  console.log(`Google Maps API calls used: ${requestCount} / ${limit}`);
}

function logLimitReachedOnce(limit: number): void {
  if (limitReachedLogged) return;
  limitReachedLogged = true;
  console.warn(
    `Google Maps API request limit reached (${limit}). Further geocoding/enrichment will use needs_lookup or skip metadata.`,
  );
}

function logSkipGeocodeOnce(): void {
  if (skipGeocodeLogged) return;
  skipGeocodeLogged = true;
  console.warn("Google Maps geocoding skipped (IMPORT_SKIP_GEOCODE=true or --no-geocode).");
}
