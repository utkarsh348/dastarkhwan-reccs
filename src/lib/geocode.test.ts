import { describe, expect, it, vi } from "vitest";
import {
  extractPlaceIdFromMapsUrl,
  pickBestPlaceResult,
  resolveLocation,
  scorePlaceMatch,
} from "./geocode";

describe("resolveLocation", () => {
  it("marks a single Places match as resolved_from_places", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        results: [
          {
            name: "Ahdoos",
            formatted_address: "Residency Road, Srinagar",
            place_id: "place-1",
            geometry: { location: { lat: 34.0837, lng: 74.7973 } },
          },
        ],
        status: "OK",
      }),
    );

    const resolved = await resolveLocation(
      { restaurant: "Ahdoos", city: "Srinagar" },
      { apiKey: "test-key", fetcher },
    );

    expect(resolved).toMatchObject({
      latitude: 34.0837,
      longitude: 74.7973,
      googlePlaceId: "place-1",
      locationStatus: "resolved_from_places",
    });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("query=Ahdoos%2C%20Srinagar"));
  });

  it("picks the best match when Places returns multiple results", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        results: [
          {
            name: "Other Cafe",
            formatted_address: "Delhi, India",
            place_id: "wrong",
            geometry: { location: { lat: 28.6, lng: 77.2 } },
          },
          {
            name: "Moon Light Bakery",
            formatted_address: "Hazratbal, Srinagar, Jammu and Kashmir",
            place_id: "moonlight",
            geometry: { location: { lat: 34.1319, lng: 74.8372 } },
          },
        ],
        status: "OK",
      }),
    );

    const resolved = await resolveLocation(
      { restaurant: "Moon Light", city: "Srinagar", area: "Hazratbal" },
      { apiKey: "test-key", fetcher },
    );

    expect(resolved).toMatchObject({
      latitude: 34.1319,
      longitude: 74.8372,
      googlePlaceId: "moonlight",
      locationStatus: "resolved_from_places",
    });
  });

  it("resolves coordinates embedded in a Google Maps URL without calling Places", async () => {
    const fetcher = vi.fn();

    const resolved = await resolveLocation(
      {
        restaurant: "Moon Light",
        city: "Srinagar",
        googleMapsUrl: "https://www.google.com/maps/place/Moon+Light/@34.1321,74.8375,17z",
      },
      { apiKey: "test-key", fetcher },
    );

    expect(resolved).toMatchObject({
      latitude: 34.1321,
      longitude: 74.8375,
      locationStatus: "resolved_from_link",
      googleMapsUrl: "https://www.google.com/maps/place/Moon+Light/@34.1321,74.8375,17z",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resolves query_place_id via Place Details", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("place/details")) {
        return Response.json({
          result: {
            place_id: "ChIJJyTPq56P4TgRNrF6SRDXeLc",
            formatted_address: "Residency Road, Srinagar",
            geometry: { location: { lat: 34.071966, lng: 74.8216268 } },
          },
          status: "OK",
        });
      }
      return Response.json({ results: [], status: "ZERO_RESULTS" });
    });

    const resolved = await resolveLocation(
      {
        restaurant: "Chai Jaai",
        city: "Srinagar",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Chai%20Jaai%2C%20Srinagar&query_place_id=ChIJJyTPq56P4TgRNrF6SRDXeLc",
      },
      { apiKey: "test-key", fetcher },
    );

    expect(resolved).toMatchObject({
      latitude: 34.071966,
      longitude: 74.8216268,
      googlePlaceId: "ChIJJyTPq56P4TgRNrF6SRDXeLc",
      locationStatus: "resolved_from_places",
    });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("place/details"));
  });

  it("retries with a simpler query when the first search returns nothing", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ results: [], status: "ZERO_RESULTS" }))
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              name: "Irani Cafe",
              formatted_address: "Old City, Ahmedabad, Gujarat",
              place_id: "irani",
              geometry: { location: { lat: 23.02, lng: 72.58 } },
            },
          ],
          status: "OK",
        }),
      );

    const resolved = await resolveLocation(
      { restaurant: "Irani Cafe", city: "Ahmedabad", area: "Old City" },
      { apiKey: "test-key", fetcher },
    );

    expect(resolved.latitude).toBe(23.02);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("scorePlaceMatch", () => {
  it("scores a city-matching result higher than an unrelated one", () => {
    const good = scorePlaceMatch(
      { name: "Ahdoos", formatted_address: "Srinagar, Jammu and Kashmir" },
      { restaurant: "Ahdoos", city: "Srinagar" },
    );
    const bad = scorePlaceMatch(
      { name: "Ahdoos", formatted_address: "Mumbai, Maharashtra" },
      { restaurant: "Ahdoos", city: "Srinagar" },
    );
    expect(good).toBeGreaterThan(bad);
  });
});

describe("extractPlaceIdFromMapsUrl", () => {
  it("reads query_place_id from search URLs", () => {
    expect(
      extractPlaceIdFromMapsUrl(
        "https://www.google.com/maps/search/?api=1&query=Foo&query_place_id=abc123",
      ),
    ).toBe("abc123");
  });
});

describe("pickBestPlaceResult", () => {
  it("returns null when no result clears the threshold", () => {
    expect(
      pickBestPlaceResult(
        [{ name: "Unrelated", formatted_address: "Tokyo, Japan", geometry: { location: { lat: 1, lng: 2 } } }],
        { restaurant: "Ahdoos", city: "Srinagar" },
      ),
    ).toBeNull();
  });
});
