import { describe, expect, it } from "vitest";
import { detectCityFromAddress, isFoodPlaceMetadata, scorePlaceNameMatch } from "./place-audit";

describe("place audit helpers", () => {
  it("detects Bengaluru from the verified Ishara address", () => {
    expect(
      detectCityFromAddress(
        "2512, Mahatma Gandhi Rd, near Trinity Circle, Bengaluru, Karnataka 560008, India",
      ),
    ).toBe("Bengaluru");
  });

  it("scores close place names higher than unrelated names", () => {
    expect(scorePlaceNameMatch("Ishara", "Ishaara, MG Road")).toBeGreaterThan(0.7);
    expect(scorePlaceNameMatch("Ishara", "Parimal Garden")).toBeLessThan(0.35);
  });

  it("flags non-food place types", () => {
    expect(isFoodPlaceMetadata({ types: ["restaurant", "point_of_interest"] })).toBe(true);
    expect(isFoodPlaceMetadata({ types: ["park", "tourist_attraction"] })).toBe(false);
  });
});
