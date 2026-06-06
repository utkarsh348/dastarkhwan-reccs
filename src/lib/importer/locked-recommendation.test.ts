import { describe, expect, it } from "vitest";
import { isLockedRecommendation, LOCKED_CONFIDENCE_THRESHOLD } from "./locked-recommendation";

const base = {
  restaurant: "Ahdoos",
  city: "Srinagar",
  note: "Try the wazwan thali",
  snippet: "Ahdoos is great for wazwan",
  sourceName: "Gokul",
  threadId: "thread-1",
  confidence: 0.8,
};

describe("isLockedRecommendation", () => {
  it("accepts a complete thread-backed candidate", () => {
    expect(isLockedRecommendation(base)).toBe(true);
  });

  it("accepts provenance parsed from rawRefLabel", () => {
    expect(
      isLockedRecommendation({
        ...base,
        threadId: undefined,
        rawRefLabel: "thread abc-42 lines 10-12",
      }),
    ).toBe(true);
  });

  it("rejects rows below the confidence threshold", () => {
    expect(
      isLockedRecommendation({ ...base, confidence: LOCKED_CONFIDENCE_THRESHOLD - 0.01 }),
    ).toBe(false);
  });

  it("rejects rows without contributor voice", () => {
    expect(isLockedRecommendation({ ...base, note: null, snippet: "  " })).toBe(false);
  });

  it("rejects rows missing sourceName or provenance", () => {
    expect(isLockedRecommendation({ ...base, sourceName: "" })).toBe(false);
    expect(isLockedRecommendation({ ...base, threadId: undefined, rawRefLabel: null })).toBe(
      false,
    );
  });

  it("rejects speculative rows without city or restaurant", () => {
    expect(isLockedRecommendation({ ...base, city: "" })).toBe(false);
    expect(isLockedRecommendation({ ...base, restaurant: "A" })).toBe(false);
  });
});
