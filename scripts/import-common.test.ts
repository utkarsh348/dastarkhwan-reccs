import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRecommendationsFromCandidates,
  shouldSkipGeocode,
} from "./import-common";
import { resetGoogleMapsRequestCount } from "../src/lib/google-maps-budget";
import { resetGeocodeCache } from "../src/lib/geocode";

vi.mock("../src/lib/geocode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/geocode")>();
  return {
    ...actual,
    resolveLocation: vi.fn(async () => ({
      latitude: 1,
      longitude: 2,
      googlePlaceId: "place-1",
      googleMapsUrl: null,
      locationStatus: "resolved_from_places" as const,
      locationConfidence: 0.9,
      address: null,
    })),
  };
});

import { resolveLocation } from "../src/lib/geocode";

const lockedCandidate = {
  restaurant: "Ahdoos",
  restaurantSlug: "ahdoos",
  city: "Srinagar",
  citySlug: "srinagar",
  area: null,
  address: null,
  dishes: [],
  tags: [],
  note: "Try wazwan",
  snippet: "Ahdoos is great",
  sourceName: "Gokul",
  confidence: 0.8,
  googleMapsUrl: null,
  sourceHash: "hash-1",
  sourceDate: "2024-01-01T00:00:00.000Z",
  rawRefLabel: "session sess-1 lines 1-2",
  sessionId: "sess-1",
};

const speculativeCandidate = {
  ...lockedCandidate,
  sourceName: "",
  sessionId: undefined,
  rawRefLabel: "heuristic line 1",
  confidence: 0.3,
};

describe("shouldSkipGeocode", () => {
  it("skips by default unless --geocode is passed", () => {
    expect(shouldSkipGeocode({ geocode: false, noGeocode: false })).toBe(true);
    expect(shouldSkipGeocode({ geocode: true, noGeocode: false })).toBe(false);
    expect(shouldSkipGeocode({ geocode: true, noGeocode: true })).toBe(true);
  });
});

describe("buildRecommendationsFromCandidates", () => {
  afterEach(() => {
    resetGoogleMapsRequestCount();
    resetGeocodeCache();
    vi.mocked(resolveLocation).mockClear();
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    delete process.env.IMPORT_SKIP_GEOCODE;
  });

  it("does not geocode by default", async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = "test-key";

    const rows = await buildRecommendationsFromCandidates([lockedCandidate], "whatsapp_zip", {
      skipGeocode: true,
    });

    expect(resolveLocation).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ locationStatus: "needs_lookup", locationConfidence: 0 });
  });

  it("geocodes only locked rows when geocode is enabled", async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = "test-key";

    const rows = await buildRecommendationsFromCandidates(
      [lockedCandidate, speculativeCandidate],
      "whatsapp_zip",
      { skipGeocode: false, geocodeLockedOnly: true },
    );

    expect(resolveLocation).toHaveBeenCalledTimes(1);
    expect(rows[0]).toMatchObject({ googlePlaceId: "place-1" });
    expect(rows[1]).toMatchObject({ locationStatus: "needs_lookup" });
  });
});
