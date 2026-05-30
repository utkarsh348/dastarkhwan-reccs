import { describe, expect, it } from "vitest";
import {
  auditCuisineSummary,
  buildCuisineSummary,
  isTestimonialLikeCuisineSummary,
  isValidCuisineSummary,
  isWeakGenericCuisineSummary,
  repairCuisineSummary,
} from "./cuisine-summary";

describe("cuisine summary validation", () => {
  it("rejects testimonial review language", () => {
    expect(isTestimonialLikeCuisineSummary("Known for best ice cream I've had in Ahmedabad")).toBe(
      true,
    );
    expect(isValidCuisineSummary("Known for best ice cream I've had in Ahmedabad")).toBe(false);
  });

  it("accepts short dish descriptors", () => {
    expect(isValidCuisineSummary("Known for Thali & Gujarati")).toBe(true);
    expect(isValidCuisineSummary("Bakery · Cafe · Ice Cream & Dessert")).toBe(true);
  });

  it("rejects overly generic known-for lines", () => {
    expect(isWeakGenericCuisineSummary("Known for Curries")).toBe(true);
    expect(isWeakGenericCuisineSummary("Known for Chai & Coffee")).toBe(false);
  });

  it("audits overlapping testimonial copy", () => {
    const issues = auditCuisineSummary({
      cuisineSummary: "Known for best ice cream I've had in Ahmedabad",
      note: "Please go to Devrani Jethani ice creams",
      snippet: "Please go to Devrani Jethani ice creams",
    });
    expect(issues.map((issue) => issue.code)).toContain("testimonial");
  });
});

describe("repairCuisineSummary", () => {
  it("falls back to Google types when review text is testimonial-like", () => {
    const repaired = repairCuisineSummary(
      "Known for best ice cream I've had in Ahmedabad",
      {
        types: ["ice_cream_shop", "dessert_shop"],
        editorialOverview: null,
        reviews: [
          { text: "Best ice cream I've had in Ahmedabad. Love the falooda too.", rating: 5 },
        ],
      },
      { note: "Please go to Devrani Jethani ice creams", snippet: "Please go to Devrani Jethani ice creams" },
    );

    expect(repaired).toBe("Ice cream · Desserts");
    expect(isValidCuisineSummary(repaired)).toBe(true);
  });

  it("buildCuisineSummary never returns testimonial phrasing", () => {
    const summary = buildCuisineSummary({
      types: ["indian_restaurant", "restaurant"],
      editorialOverview: null,
      reviews: [{ text: "I loved their curry when I visited last week.", rating: 5 }],
    });
    expect(summary).toMatch(/^Indian/);
    expect(isTestimonialLikeCuisineSummary(summary)).toBe(false);
    expect(isValidCuisineSummary(summary)).toBe(true);
  });
});
