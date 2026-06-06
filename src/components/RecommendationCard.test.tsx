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
  sourceName: "Community",
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
});
