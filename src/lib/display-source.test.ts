import { describe, expect, it } from "vitest";
import { formatSourceNames } from "./display-source";

describe("formatSourceNames", () => {
  it("shows only the first name for one recommender", () => {
    expect(formatSourceNames("Aileen Chatterjee")).toBe("Aileen");
  });

  it("shows first names for multiple recommenders", () => {
    expect(formatSourceNames("Aileen Chatterjee, Paarug Sethi")).toBe("Aileen, Paarug");
    expect(formatSourceNames("Renuka Mani / Sangeeta")).toBe("Renuka, Sangeeta");
  });

  it("dedupes repeated source names", () => {
    expect(formatSourceNames("Aileen Chatterjee and Aileen")).toBe("Aileen");
  });

  it("returns null for missing source names", () => {
    expect(formatSourceNames(null)).toBeNull();
    expect(formatSourceNames("   ")).toBeNull();
  });
});
