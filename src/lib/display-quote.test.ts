import { describe, expect, it } from "vitest";
import { getDisplayQuote, isEmotionalQuote } from "./display-quote";

describe("getDisplayQuote", () => {
  it("returns emotional notes from real data", () => {
    expect(
      getDisplayQuote({
        restaurant: "Gandhi Cold Drinks",
        note: "Next to Irani cafe, there is Gandhi Cold Drinks. Love their drinks, must try especially with the heat.",
        snippet: "Next to Irani cafe, there is Gandhi Cold Drinks. Love their drinks, must try especially with the heat.",
      }),
    ).toContain("Love their drinks");
  });

  it("hides list-only snippets", () => {
    expect(
      getDisplayQuote({
        restaurant: "Gordhan Thal",
        note: "Gordhan Thal",
        snippet: "1. Gordhan Thal",
      }),
    ).toBeNull();
  });

  it("hides bare place names", () => {
    expect(
      getDisplayQuote({
        restaurant: "Curries",
        note: "Curries",
        snippet: "Curries",
      }),
    ).toBeNull();
  });

  it("scopes compound notes to the matching restaurant", () => {
    const combined =
      "Also there is this classic calzone place called UNO Pizza. I loved it when I used to go as a college student. For morning breakfast differnt kinds of poha is a thing. For best experience go early morning to Parimal Garde";

    expect(
      getDisplayQuote({
        restaurant: "UNO Pizza",
        note: combined,
        snippet: combined,
      }),
    ).toMatch(/college student/i);

    expect(
      getDisplayQuote({
        restaurant: "UNO Pizza",
        note: combined,
        snippet: combined,
      }),
    ).not.toMatch(/poha|Parimal/i);
  });

  it("keeps Srinagar emotional snippets", () => {
    expect(
      getDisplayQuote({
        restaurant: "Chai Jaai",
        note: "MUST go for the best kashmiri beverages & snacks. It's also an extremely pretty place",
        snippet: "Chai Jaai - MUST go for the best kashmiri beverages & snacks. It's also an extremely pretty place",
      }),
    ).toMatch(/MUST go/);
  });
});

describe("isEmotionalQuote", () => {
  it("rejects label-only lines", () => {
    expect(isEmotionalQuote("Swati Snacks:", "Swati Snacks")).toBe(false);
  });
});
