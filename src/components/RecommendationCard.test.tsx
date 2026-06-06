import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecommendationCard } from "./RecommendationCard";
import type { Recommendation } from "@/lib/types";

const baseRecommendation: Recommendation = {
  id: "rec-1",
  restaurant: "Curries",
  restaurantSlug: "curries",
  city: "Ahmedabad",
  citySlug: "ahmedabad",
  area: null,
  address: null,
  latitude: null,
  longitude: null,
  googlePlaceId: null,
  googleMapsUrl: null,
  locationStatus: "needs_lookup",
  locationConfidence: 0,
  dishes: [],
  tags: [],
  cuisineSummary: null,
  note: null,
  snippet: "Curries",
  sourceName: "Aileen Chatterjee",
  confidence: 0.95,
  createdBy: "test",
  updatedBy: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

describe("RecommendationCard", () => {
  it("does not render name-only snippets as fallback body text", () => {
    const html = renderToStaticMarkup(
      <RecommendationCard recommendation={baseRecommendation} showEdit={false} />,
    );

    expect(html).toContain("<h2>Curries</h2>");
    expect(html).not.toContain("rec-note");
  });

  it("renders Google-derived cuisine summaries when community quote is unavailable", () => {
    const html = renderToStaticMarkup(
      <RecommendationCard
        recommendation={{ ...baseRecommendation, cuisineSummary: "Indian · Known for thali" }}
        showEdit={false}
      />,
    );

    expect(html).toContain("Indian · Known for thali");
    expect(html).not.toContain("rec-note");
  });

  it("renders only first names for source attribution", () => {
    const html = renderToStaticMarkup(
      <RecommendationCard
        recommendation={{ ...baseRecommendation, sourceName: "Aileen Chatterjee, Paarug Sethi" }}
        showEdit={false}
      />,
    );

    expect(html).toContain("Recommended by Aileen, Paarug");
    expect(html).not.toContain("Chatterjee");
    expect(html).not.toContain("Sethi");
  });

  it("renders location metadata by default", () => {
    const html = renderToStaticMarkup(
      <RecommendationCard recommendation={{ ...baseRecommendation, area: "Navrangpura" }} showEdit={false} />,
    );

    expect(html).toContain("Navrangpura / Ahmedabad");
  });

  it("can hide location metadata on city pages", () => {
    const html = renderToStaticMarkup(
      <RecommendationCard
        recommendation={{ ...baseRecommendation, area: "Navrangpura", cuisineSummary: "Indian · Known for thali" }}
        showEdit={false}
        showLocationMeta={false}
      />,
    );

    expect(html).not.toContain("Navrangpura");
    expect(html).not.toContain("Ahmedabad");
    expect(html).toContain("<h2>Curries</h2>");
    expect(html).toContain("Indian · Known for thali");
    expect(html).toContain("Recommended by Aileen");
  });
});
