import { describe, expect, it } from "vitest";
import {
  buildGoogleMapsSearchUrl,
  buildLocationQuery,
  extractGoogleMapsUrls,
  normalizeLocationStatus,
} from "./location";

describe("location helpers", () => {
  it("extracts Google Maps links from recommendation text", () => {
    const text = "Go here https://maps.app.goo.gl/abc123 and try the kebabs";

    expect(extractGoogleMapsUrls(text)).toEqual(["https://maps.app.goo.gl/abc123"]);
  });

  it("builds the most specific lookup query from restaurant, area, city, and address", () => {
    expect(
      buildLocationQuery({
        restaurant: "Moon Light",
        area: "Hazratbal",
        city: "Srinagar",
        address: "University Main Road, Hazaratbal, Srinagar, Jammu and Kashmir",
      }),
    ).toBe("Moon Light, University Main Road, Hazaratbal, Srinagar, Jammu and Kashmir");

    expect(buildLocationQuery({ restaurant: "Ahdoos", city: "Srinagar" })).toBe("Ahdoos, Srinagar");
  });

  it("builds a Google Maps search URL without requiring the Maps JavaScript API", () => {
    expect(buildGoogleMapsSearchUrl("Ahdoos", "Srinagar")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Ahdoos%2C%20Srinagar",
    );
  });

  it("keeps location statuses in the supported vocabulary", () => {
    expect(normalizeLocationStatus("resolved_from_places")).toBe("resolved_from_places");
    expect(normalizeLocationStatus("something else")).toBe("needs_lookup");
  });
});
