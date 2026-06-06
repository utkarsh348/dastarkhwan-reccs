import { describe, expect, it } from "vitest";
import {
  derivePlaceLabels,
  extractFamousForFromReviews,
  formatCuisineSummary,
  typesToPlaceLabels,
} from "./place-metadata";

describe("typesToPlaceLabels", () => {
  it("maps cuisine and establishment types", () => {
    expect(
      typesToPlaceLabels(["restaurant", "indian_restaurant", "bakery", "point_of_interest"]),
    ).toEqual(["Indian", "Bakery"]);
  });

  it("maps unknown restaurant suffixes", () => {
    expect(typesToPlaceLabels(["kashmiri_restaurant"])).toEqual(["Kashmiri"]);
  });
});

describe("derivePlaceLabels", () => {
  it("caps labels at four", () => {
    const labels = derivePlaceLabels({
      types: [
        "indian_restaurant",
        "vegetarian_restaurant",
        "bakery",
        "cafe",
        "meal_takeaway",
        "bar",
      ],
      editorialOverview: null,
      reviews: [],
    });
    expect(labels.length).toBeLessThanOrEqual(4);
  });
});

describe("extractFamousForFromReviews", () => {
  it("pulls famous-for phrases from review text", () => {
    expect(
      extractFamousForFromReviews([
        {
          text: "Must try the Gujarati thali and farsan. Best samosa in Ahmedabad.",
          rating: 5,
        },
      ]),
    ).toBe("Gujarati thali and farsan");
  });

  it("falls back to frequent food keywords", () => {
    expect(
      extractFamousForFromReviews([
        { text: "Amazing walnut fudge and kulfi every time.", rating: 5 },
        { text: "Love the walnut fudge on hot days.", rating: 4 },
      ]),
    ).toBe("Known for Walnut Fudge & Kulfi");
  });
});

describe("formatCuisineSummary", () => {
  it("joins type labels with middle dot", () => {
    expect(
      formatCuisineSummary({
        types: ["indian_restaurant", "bakery"],
        editorialOverview: null,
        reviews: [],
      }),
    ).toBe("Indian · Bakery");
  });

  it("uses reviews when types are missing", () => {
    expect(
      formatCuisineSummary({
        types: ["restaurant", "food"],
        editorialOverview: null,
        reviews: [{ text: "Famous for their wazwan and kahwa.", rating: 5 }],
      }),
    ).toBe("Known for wazwan and kahwa");
  });

  it("replaces generic-only types with famous-for line", () => {
    expect(
      formatCuisineSummary({
        types: ["meal_takeaway", "restaurant"],
        editorialOverview: null,
        reviews: [{ text: "Best street snacks and dhokla.", rating: 5 }],
      }),
    ).toBe("Known for street snacks and dhokla");
  });

  it("does not emit mojibake separators or ellipses", () => {
    const summary = formatCuisineSummary({
      types: ["bakery", "cafe"],
      editorialOverview:
        "A bakery serving cakes, pastries, coffee and several other desserts for neighbourhood regulars.",
      reviews: [],
    });

    expect(summary).toContain("·");
    expect(summary).not.toMatch(/Â|â/);
  });
});
