import { describe, expect, it } from "vitest";
import {
  extractMultiPlaceAssignments,
  findPlaceAnchors,
  multiPlaceInputsFromBody,
  shouldSplitMultiPlace,
} from "./multi-place";
import { dedupeCandidates, extractRecommendationCandidates, parseWhatsAppText } from "./whatsapp";

const UNO_MESSAGE =
  "Also there is this classic calzone place called UNO Pizza. I loved it when I used to go as a college student. For morning breakfast differnt kinds of poha is a thing. For best experience go early morning to Parimal Garde";

describe("multi-place extraction", () => {
  it("detects UNO Pizza and Parimal Garden as separate anchors", () => {
    const anchors = findPlaceAnchors(UNO_MESSAGE);
    expect(anchors.map((anchor) => anchor.name)).toEqual(["UNO Pizza", "Parimal Garden"]);
    expect(shouldSplitMultiPlace(UNO_MESSAGE, anchors)).toBe(true);
  });

  it("splits notes per place", () => {
    const assignments = extractMultiPlaceAssignments(UNO_MESSAGE);
    expect(assignments?.get("UNO Pizza")).toMatch(/calzone|college student/i);
    expect(assignments?.get("UNO Pizza")).not.toMatch(/poha|Parimal/i);
    expect(assignments?.get("Parimal Garden")).toMatch(
      /different kinds of poha.*early morning to Parimal Garden/is,
    );
    expect(assignments?.get("Parimal Garden")).not.toMatch(/UNO Pizza|calzone|college student/i);
  });

  it("extracts two candidates from a WhatsApp message", () => {
    const text = `[30/05/26, 10:55:34 AM] ~ Abhishek Durani: ${UNO_MESSAGE}`;
    const candidates = dedupeCandidates(
      extractRecommendationCandidates(parseWhatsAppText(text)),
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "UNO Pizza",
          note: expect.stringMatching(/college student/i),
        }),
        expect.objectContaining({
          restaurant: "Parimal Garden",
          note: expect.stringMatching(/poha/i),
        }),
      ]),
    );
  });

  it("does not split a single-place called message", () => {
    const body = "There is this classic place called Swati Snacks. Love their farsan.";
    expect(multiPlaceInputsFromBody(body)).toBeNull();
  });
});
