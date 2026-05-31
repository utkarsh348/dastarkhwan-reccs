import { describe, expect, it } from "vitest";
import { dedupeCandidates } from "./dedupe";
import { extractRecommendationCandidates } from "./whatsapp-heuristic";
import { parseWhatsAppText, sortMessagesChronologically } from "./whatsapp";

const srinagarCluster = `[09/05/26, 2:47:22 PM] ~ Abhishek Durani: Moon Light - The Walnut Fudge Shop مون لاںٔٹ, New Shopping Complex, 4RGP+RR, Block-A, Auqaf Building, University Main Road, Hazaratbal, Srinagar, Jammu and Kashmir
[09/05/26, 12:22:27 PM] ~ Abhishek Durani: Don’t miss going to moonlight bakery and try their Walnut fudge 😍 and everything else as well.
[09/05/26, 11:47:59 AM] ~ Gokul Ratakonda: Ahdoos their wazwan was awesome
[09/05/26, 10:35:01 AM] ~ Hetall: Chai Jaai - MUST go for the best kashmiri beverages & snacks. It's also an extremely pretty place
[09/05/26, 10:34:01 AM] ~ Udayan: Heyloo folks,

Need your top food reccos in Srinagar. Here for a few days for moms birthday.

Anything from breakfast spots, bakery, restaurants or wazwan places`;

describe("WhatsApp parsing and extraction", () => {
  it("parses nested transcript lines and sorts newest-first snippets chronologically", () => {
    const messages = parseWhatsAppText(srinagarCluster);
    const sorted = sortMessagesChronologically(messages);

    expect(messages).toHaveLength(5);
    expect(sorted[0]?.sender).toBe("Udayan");
    expect(sorted[0]?.body).toContain("Srinagar");
    expect(sorted.at(-1)?.sender).toBe("Abhishek Durani");
  });

  it("infers Srinagar from the context-setting ask and extracts the known seed recommendations", () => {
    const messages = sortMessagesChronologically(parseWhatsAppText(srinagarCluster));
    const candidates = dedupeCandidates(extractRecommendationCandidates(messages));

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: expect.stringMatching(/moon/i),
          city: "Srinagar",
          dishes: expect.arrayContaining(["walnut fudge"]),
          sourceName: "Abhishek",
        }),
        expect.objectContaining({
          restaurant: "Ahdoos",
          city: "Srinagar",
          dishes: expect.arrayContaining(["wazwan"]),
          sourceName: "Gokul",
        }),
        expect.objectContaining({
          restaurant: "Chai Jaai",
          city: "Srinagar",
          dishes: expect.arrayContaining(["kashmiri beverages", "snacks"]),
          sourceName: "Hetall",
        }),
      ]),
    );
  });

  it("deduplicates repeated restaurant mentions while preserving dish and snippet evidence", () => {
    const messages = sortMessagesChronologically(parseWhatsAppText(srinagarCluster));
    const moon = dedupeCandidates(extractRecommendationCandidates(messages)).filter((candidate) =>
      candidate.restaurant.toLowerCase().includes("moon"),
    );

    expect(moon).toHaveLength(1);
    expect(moon[0]?.dishes).toContain("walnut fudge");
    expect(moon[0]?.snippet).toMatch(/walnut fudge|Moon Light/i);
    expect(moon[0]?.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("extracts places from list-style Ahmedabad messages without treating category headings as restaurants", () => {
    const text = `[30/05/26, 10:25:59 AM] ~ Ankita: Guys can you help with food recommendations in Ahmedabad
[30/05/26, 10:45:56 AM] ~ Abhishek Durani: For great veg gujju thalis: (must try)
1. Gordhan Thal
2. Agashiye (just fancier version of the above)
[30/05/26, 10:47:16 AM] ~ Pranav Joshi: Good nonveg -

Mirch Masala (good kebabs, SG Road)

Lolo Roso (best prawn dumplings and stroganoff/fajita bowls, Bodakdev)
[30/05/26, 10:54:01 AM] ~ Pranav Joshi: Best Chai -

Bobby Tea Stall (Ambawadi, best known for kickass chai and rabri bun maska)`;

    const candidates = dedupeCandidates(
      extractRecommendationCandidates(sortMessagesChronologically(parseWhatsAppText(text))),
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ restaurant: "Gordhan Thal", city: "Ahmedabad" }),
        expect.objectContaining({ restaurant: "Agashiye", city: "Ahmedabad" }),
        expect.objectContaining({ restaurant: "Mirch Masala", city: "Ahmedabad" }),
        expect.objectContaining({ restaurant: "Lolo Roso", city: "Ahmedabad" }),
        expect.objectContaining({ restaurant: "Bobby Tea Stall", city: "Ahmedabad" }),
      ]),
    );
    expect(candidates.map((candidate) => candidate.restaurant)).not.toContain("Good Nonveg");
    expect(candidates.map((candidate) => candidate.restaurant)).not.toContain("Best Chai");
  });
});
