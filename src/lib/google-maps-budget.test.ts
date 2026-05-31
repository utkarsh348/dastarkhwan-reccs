import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getGoogleMapsMaxRequests,
  getGoogleMapsRequestCount,
  isGoogleMapsSkipGeocode,
  logGoogleMapsBudgetSummary,
  recordGoogleMapsRequest,
  resetGoogleMapsRequestCount,
} from "./google-maps-budget";

describe("google-maps-budget", () => {
  afterEach(() => {
    resetGoogleMapsRequestCount();
    delete process.env.GOOGLE_MAPS_MAX_REQUESTS;
    delete process.env.IMPORT_GEOCODE_MAX;
    delete process.env.IMPORT_SKIP_GEOCODE;
  });

  it("defaults to 500 max requests", () => {
    expect(getGoogleMapsMaxRequests()).toBe(500);
  });

  it("reads GOOGLE_MAPS_MAX_REQUESTS and IMPORT_GEOCODE_MAX", () => {
    process.env.GOOGLE_MAPS_MAX_REQUESTS = "42";
    expect(getGoogleMapsMaxRequests()).toBe(42);

    delete process.env.GOOGLE_MAPS_MAX_REQUESTS;
    process.env.IMPORT_GEOCODE_MAX = "99";
    expect(getGoogleMapsMaxRequests()).toBe(99);
  });

  it("blocks requests when skip geocode is enabled", () => {
    process.env.IMPORT_SKIP_GEOCODE = "true";
    expect(isGoogleMapsSkipGeocode()).toBe(true);
    expect(recordGoogleMapsRequest("text_search")).toBe(false);
    expect(getGoogleMapsRequestCount()).toBe(0);
  });

  it("stops recording after the limit", () => {
    process.env.GOOGLE_MAPS_MAX_REQUESTS = "2";
    expect(recordGoogleMapsRequest("text_search")).toBe(true);
    expect(recordGoogleMapsRequest("place_details_geocode")).toBe(true);
    expect(recordGoogleMapsRequest("text_search")).toBe(false);
    expect(getGoogleMapsRequestCount()).toBe(2);
  });

  it("logs a budget summary", () => {
    process.env.GOOGLE_MAPS_MAX_REQUESTS = "10";
    recordGoogleMapsRequest("text_search");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logGoogleMapsBudgetSummary();
    expect(logSpy).toHaveBeenCalledWith("Google Maps API calls used: 1 / 10");
    logSpy.mockRestore();
  });
});
