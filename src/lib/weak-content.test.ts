import { describe, expect, it } from "vitest";
import { filterStrongLabels, isWeakLabel, isWeakNote, mergePlaceMetadata, needsPlaceMetadata } from "./weak-content";

describe("isWeakLabel", () => {
  it("rejects generic snacks", () => {
    expect(isWeakLabel("snacks", "Swati Snacks")).toBe(true);
  });

  it("keeps specific dishes", () => {
    expect(isWeakLabel("walnut fudge", "Moon Light")).toBe(false);
    expect(isWeakLabel("wazwan", "Ahdoos")).toBe(false);
  });
});

describe("isWeakNote", () => {
  it("rejects comparative filler", () => {
    expect(isWeakNote("just fancier version of the above", "Agashiye")).toBe(true);
  });

  it("keeps emotional notes", () => {
    expect(
      isWeakNote("Love their drinks, must try especially with the heat.", "Gandhi Cold Drinks"),
    ).toBe(false);
  });
});

describe("mergePlaceMetadata", () => {
  it("strips weak dishes and notes without injecting google labels", () => {
    const merged = mergePlaceMetadata(
      {
        restaurant: "Swati Snacks",
        dishes: ["snacks"],
        tags: ["snacks"],
        note: "Swati Snacks:",
      },
      ["Gujarati", "Snacks shop"],
    );
    expect(merged.dishes).toEqual([]);
    expect(merged.tags).toEqual([]);
    expect(merged.note).toBeNull();
  });

  it("keeps strong community dishes", () => {
    const merged = mergePlaceMetadata(
      {
        restaurant: "Ahdoos",
        dishes: ["wazwan"],
        tags: ["restaurant"],
        note: "Ahdoos their wazwan was awesome",
      },
      ["Indian", "Restaurant"],
    );
    expect(merged.dishes).toEqual(["wazwan"]);
    expect(merged.tags).toEqual([]);
  });
});

describe("needsPlaceMetadata", () => {
  it("is true when only weak labels exist", () => {
    expect(needsPlaceMetadata({ restaurant: "Swati Snacks", dishes: ["snacks"], tags: ["snacks"] })).toBe(
      true,
    );
  });

  it("is false when a strong dish exists", () => {
    expect(needsPlaceMetadata({ restaurant: "Chai Jaai", dishes: ["kashmiri beverages"], tags: [] })).toBe(
      false,
    );
  });
});
