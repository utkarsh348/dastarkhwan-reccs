import { mkdtemp, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, it, vi } from "vitest";
import { extractContextualRecommendations, writeContextualReviewFiles } from "./contextual";
import { detectWhatsAppDateOrder, parseWhatsAppText, sortMessagesChronologically } from "./whatsapp";

function allReviewRows(result: Awaited<ReturnType<typeof extractContextualRecommendations>>) {
  return [...result.candidates, ...(result.parked ?? [])];
}

describe("contextual WhatsApp extraction", () => {
  it("auto-detects month-first exports and rejects impossible overflow dates", () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need food reccos in Bangalore
[06/16/26, 9:05:00 AM] ~ B: Try Vidyarthi Bhavan for dosa
[13/40/26, 9:05:00 AM] ~ C: impossible date`;

    expect(detectWhatsAppDateOrder(text)).toBe("month-first");
    const messages = parseWhatsAppText(text);

    expect(messages).toHaveLength(2);
    expect(messages[0]?.timestamp.toISOString()).toBe("2026-06-15T09:00:00.000Z");
    expect(messages[1]?.timestamp.toISOString()).toBe("2026-06-16T09:05:00.000Z");
  });

  it("does not carry city context across separated mini-threads", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need food reccos in Bangalore
[06/15/26, 9:02:00 AM] ~ B: Try Vidyarthi Bhavan for dosa
[06/15/26, 11:00:00 AM] ~ C: Need dinner recommendations
[06/15/26, 11:01:00 AM] ~ D: Try Toast & Tonic`;
    const fetcher = vi.fn(async () =>
      Response.json({
        message: {
          content: JSON.stringify({
            recommendations: [
              {
                restaurant: "Toast & Tonic",
                city: "Unsorted",
                snippet: "Try Toast & Tonic",
                sourceName: "D",
                confidence: 0.86,
              },
            ],
            rejected: [],
          }),
        },
      }),
    );

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      fetcher,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ restaurant: "Toast & Tonic", city: "Unsorted" }),
      ]),
    );
    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toContain("Vidyarthi Bhavan");
  });

  it("rejects event RSVP/name-list chatter instead of extracting names as restaurants", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Finalised RSVPs for the workshop
[06/15/26, 9:01:00 AM] ~ A: - Sahiti
[06/15/26, 9:02:00 AM] ~ A: - Piyanshu Raj
[06/15/26, 9:03:00 AM] ~ A: Notes: venue and agenda soon`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.rejected.some((item) => item.classification === "event_admin")).toBe(true);
  });

  it("rejects hyphenated non-recommendation chatter from deterministic fallback", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Anyone up for food later?
[06/15/26, 9:01:00 AM] ~ B: Wow - you know aavesham!
[06/15/26, 9:02:00 AM] ~ C: Final dish - this salad recipe is nice`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(result.candidates).toHaveLength(0);
  });

  it("treats request text as anchor metadata instead of a restaurant", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ Neha: Hi folks - sourcing some reccos for a dinner this week, got friends visiting from Sweden
[06/15/26, 9:02:00 AM] ~ Abhishek: Bengaluru Oota Company
[06/15/26, 9:03:00 AM] ~ Ojas: For Indian, Tandoor on MG road is a great place to take overseas guests to`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toContain("Hi Folks");
    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Tandoor",
          anchorType: "request_reply",
          anchorText: expect.stringContaining("sourcing some reccos"),
        }),
      ]),
    );
  });

  it("rejects event logistics, people lists, anti-recs, and casual lines even inside food-heavy threads", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Guys can you help with food recommendations in Chandigarh?
[06/15/26, 9:01:00 AM] ~ B: If your list says Pal Dhaba - I will reject it
[06/15/26, 9:02:00 AM] ~ C: Quick question - I want to book tix for more than 1 person
[06/15/26, 9:03:00 AM] ~ D: Running a little late
[06/15/26, 9:04:00 AM] ~ E: POLL:
[06/15/26, 9:05:00 AM] ~ F: EVERYONE
[06/15/26, 9:06:00 AM] ~ G: Have my exams this afternoon - MA English and topic is Gender Studies
[06/15/26, 9:06:20 AM] ~ G: I love how silent everyone is until there is an interesting conversation
[06/15/26, 9:06:40 AM] ~ G: What about Arirang in Kammanahalli
Did anyone try it
[06/15/26, 9:06:50 AM] ~ I: Hello everyone, my name is Arun. I got really into food content and decided to try and cook everything myself.
Cheers,
Arun
[06/15/26, 9:07:00 AM] ~ H: Final Guestlist
- Manu
- Garima Tiwari
- Deepak Vijaykeerthy
Notes:
- Venue and ticket links soon`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(result.candidates).toHaveLength(0);
  });

  it("adds request_reply anchor metadata to deterministic request replies", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need food reccos in Bangalore
[06/15/26, 9:02:00 AM] ~ B: Try Vidyarthi Bhavan for dosa`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: expect.stringMatching(/Vidyarthi/i),
          city: "Bengaluru",
          anchorType: "request_reply",
          anchorSender: "A",
          anchorLines: "lines 1-1",
          candidateLines: "lines 2-2",
        }),
      ]),
    );
  });

  it("adds self_initiated anchor metadata to explicit self recommendations", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Chai Jaai - MUST go for the best kashmiri beverages & snacks. It's also an extremely pretty place`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Chai Jaai",
          anchorType: "self_initiated",
          anchorText: expect.stringContaining("MUST go"),
        }),
      ]),
    );
  });

  it("keeps curated place lists only when anchored to a request", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Give recommendations to eat in bombay
[06/15/26, 9:02:00 AM] ~ B: Americano
Mool
Kala ghoda cafe
Bayroute`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ restaurant: "Americano", anchorType: "curated_list" }),
        expect.objectContaining({ restaurant: "Kala Ghoda Cafe", anchorType: "curated_list" }),
      ]),
    );
  });

  it("rejects dish-only home cooking lists even when they follow food chatter", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: What was so interesting was that Harnidh also makes Irani food.
[06/15/26, 9:02:00 AM] ~ Harnidh: Kadhi chawal
Chole kulche
Mutton waala saag
Aloo gobhi (for fibre obviously)
Amritsari paneer ki bhurji
[06/15/26, 9:04:00 AM] ~ B: Ashok chole kulche
Brijwasi chaat for bun tikki
A1 ka kulfan (best in the world)`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(result.candidates).toHaveLength(0);
  });

  it("rejects recipe and ingredient suggestion threads instead of extracting ingredients as places", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Folks - any suggestions for healthy breakfast recipes? Have a limited set right now which I am getting tired of!
[06/15/26, 9:02:00 AM] ~ B: Milky Mist Skyr
Two soft boiled eggs
Chilli oil
[06/15/26, 9:03:00 AM] ~ C: I usually pick up African, Chile and the French one. Try to develop my taste for it`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(result.candidates).toHaveLength(0);
  });

  it("normalizes conjunctions and location hints in restaurant names", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need Jaipur and Mumbai food recommendations
[06/15/26, 9:02:00 AM] ~ B: And Rawat Mishtan Bhandar - for those kachoris. Really really good.
[06/15/26, 9:03:00 AM] ~ C: Vinay in South Mumbai
Martand in Lalbaug`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Rawat Mishtan Bhandar",
          note: "for those kachoris. Really really good.",
          needsDescriptor: false,
        }),
        expect.objectContaining({
          restaurant: "Vinay",
          area: "South Mumbai",
          note: null,
          needsDescriptor: true,
        }),
        expect.objectContaining({
          restaurant: "Martand",
          area: "Lalbaug",
          note: null,
          needsDescriptor: true,
        }),
      ]),
    );
  });

  it("rejects non-place phrases that happen to contain recommendation verbs", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need food reccos in Bangalore
[06/15/26, 9:02:00 AM] ~ B: Hope to break bread soon Ankush. I love Manav Kaul the actor, though haven't read much of what he writes. Must try and get hold of it sometime.
[06/15/26, 9:03:00 AM] ~ C: Yes I’ve had stuff from deliciae a bunch; wanted to try something new
[06/15/26, 9:04:00 AM] ~ D: I usually pick up African, Chile and the French one. Try to develop my taste for it`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(result.candidates).toHaveLength(0);
  });

  it("marks bare-list candidates as needing descriptor enrichment", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Give recommendations to eat in bombay
[06/15/26, 9:02:00 AM] ~ B: Americano
Kala ghoda cafe`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Americano",
          note: null,
          needsDescriptor: true,
          descriptorSource: "google_places_needed",
        }),
      ]),
    );
  });

  it("keeps useful sentiment notes as community descriptors", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need Jaipur food recommendations
[06/15/26, 9:02:00 AM] ~ B: And Rawat Mishtan Bhandar - for those kachoris. Really really good.`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Rawat Mishtan Bhandar",
          note: "for those kachoris. Really really good.",
          needsDescriptor: false,
          descriptorSource: "community_note",
        }),
      ]),
    );
  });

  it("keeps maps links only with food context and rejects event maps links", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Try Vidyarthi Bhavan. Best dosa https://maps.app.goo.gl/pA82DtEax8cXiWEr7?g_st=ac
[06/15/26, 11:00:00 AM] ~ B: Final Guestlist
- Manu
Notes:
- Please come to this location sharp by 7:30 https://maps.app.goo.gl/eventlink`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result).every((candidate) => candidate.restaurant !== "Manu")).toBe(true);
    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          anchorType: "maps_link",
          anchorText: expect.stringContaining("maps.app.goo.gl"),
        }),
      ]),
    );
  });

  it("assembles unstructured nearby recommendation messages through the local model contract", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need food reccos in Calcutta
[06/15/26, 9:02:00 AM] ~ B: Peter Cat
[06/15/26, 9:03:00 AM] ~ B: chelo kebab there is the move`;
    const fetcher = vi.fn(async () =>
      Response.json({
        message: {
          content: JSON.stringify({
            threadRole: "restaurant_recommendation",
            requestUpdates: [],
            mentions: [
              {
                mentionId: "m1",
                decision: "recommendation",
                restaurantSpan: "Peter Cat",
                city: "Kolkata",
                areaSpan: null,
                dishSpans: ["chelo kebab"],
                cuisineTags: ["kebab"],
                sentimentSpan: "chelo kebab there is the move",
                anchorLineRefs: ["lines 1-1"],
                candidateLineRefs: ["lines 2-3"],
                supportLineRefs: ["lines 3-3"],
                reason: "Peter Cat is recommended in response to the Calcutta food request",
              },
            ],
          }),
        },
      }),
    );

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      fetcher,
      runId: "test-run",
    });

    expect(fetcher).toHaveBeenCalled();
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Peter Cat",
          city: "Kolkata",
          dishes: ["chelo kebab"],
          confidenceBand: "likely_importable",
        }),
      ]),
    );
  });

  it("resolves Darshita's Jaipur request from Akash's bracketed itinerary list", async () => {
    const text = `[03/08/25, 8:13:17 PM] ~ Darshita: Hi hi does anyone have fun food recs for Jaipur? Lmk pls :) xx
[03/08/25, 8:17:25 PM] ~ Akash LFC: Jaipur Iternary:
---
- [Nihari] Kallu Ki Nihari (Nihari and fried chicken), go before 8am or after 7pm, best batches
- [Bar Palladio] best bar in India Raviolli, aperol cocktails, tempura, vibe. Go after 9pm
- [Tapri, in C scheme] Dal Pakwan, MUST VISIT
- [Junglee Maas] Handi, MM Khan Hotel
- [Lal Maas] Spice Court
- [Tandoori Chai] Sahu chai wala
- [Good bar vibes] Shikaar Bagh, Polo Bar
- [Shopping] Bapu Bazaar
- [kachoris & Snacks] Rawat
- [1135 AD] Amer Fort, Speakeasy restaurant
- ⁠White Sage & Jaipur Modern, best cafes of Jaipur
- Andraab, City Palace, Baaradari, Nila`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(result.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sender: "Darshita",
          city: "Jaipur",
          status: "unresolved",
          resolvedCandidateIds: [],
        }),
      ]),
    );
    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Kallu Ki Nihari",
          city: "Jaipur",
          dishes: expect.arrayContaining(["nihari", "fried chicken"]),
          anchorSender: "Darshita",
          anchorLines: "lines 1-1",
        }),
        expect.objectContaining({
          restaurant: "Tapri",
          area: "C Scheme",
          dishes: expect.arrayContaining(["dal pakwan"]),
        }),
        expect.objectContaining({
          restaurant: "Spice Court",
          dishes: expect.arrayContaining(["lal maas"]),
        }),
        expect.objectContaining({
          restaurant: "White Sage",
          tags: expect.arrayContaining(["cafe"]),
        }),
        expect.objectContaining({
          restaurant: "Jaipur Modern",
          tags: expect.arrayContaining(["cafe"]),
        }),
      ]),
    );
    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toContain("Bapu Bazaar");
  });

  it("attaches pronoun-based sentiment follow-ups to the prior place instead of creating phrase candidates", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ FOMO: Hi, any reccos for a good dinner place in & around malleshwaram? It should have alcohol/wine
[06/15/26, 9:01:00 AM] ~ Renuka: Try The Brown Table at Sadashivnagar. Great ambience, nice food and wine.
[06/15/26, 9:02:00 AM] ~ Sangeeta: I love this place. Good food and coffee
[06/15/26, 9:03:00 AM] ~ Sangeeta: the tiramisu there is to die for`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toContain("To Die For");
    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "The Brown Table",
          area: "Sadashivnagar",
          dishes: expect.arrayContaining(["tiramisu"]),
          note: expect.stringContaining("tiramisu there is to die for"),
          displayNote: expect.stringContaining("dinner place"),
          recommendationContext: expect.stringContaining("dinner place"),
          contextEvidenceLines: expect.arrayContaining(["lines 1-1", "lines 3-3", "lines 4-4"]),
          supportingLines: expect.arrayContaining(["lines 3-3", "lines 4-4"]),
        }),
      ]),
    );
  });

  it("does not absorb adjacent restaurant recommendations into the prior place note", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ FOMO: Hi, any reccos for a good dinner place in & around malleshwaram? Ideally sth that also serves alcohol/wine
[06/15/26, 9:01:00 AM] ~ Renuka: Try The Brown Table at Sadashivnagar. Great ambience, nice food and wine.
[06/15/26, 9:02:00 AM] ~ Sangeeta: the tiramisu there is to die for
[06/15/26, 9:03:00 AM] ~ Renuka: Also try Toast & Tonic. Great cocktails.`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    const brownTable = allReviewRows(result).find((candidate) => candidate.restaurant === "The Brown Table");
    expect(brownTable).toEqual(
      expect.objectContaining({
        note: expect.stringContaining("tiramisu there is to die for"),
        displayNote: expect.stringContaining("dinner place"),
      }),
    );
    expect(brownTable?.note).not.toContain("Toast & Tonic");
    expect(brownTable?.displayNote).not.toContain("Toast & Tonic");
    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).toContain("Toast & Tonic");
  });

  it("uses category-first requests as anchors for short replies", async () => {
    const text = `[12/21/24, 6:57:20 PM] ~ Priyanshu: Do y'all have bakery recommendations(for cake) around cubbon, church street or Indiranagar?
[12/21/24, 6:58:20 PM] ~ Abhishek: Lavonne, Klaa's doing a Christmas cake, Thom's
[12/21/24, 6:59:20 PM] ~ Tanya: Can try Amintri too
[12/21/24, 7:00:20 PM] ~ Abhishek: For cake cake - Amintri, Smoor, Maki`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Amintri",
          anchorType: "request_reply",
          anchorSender: "Priyanshu",
          anchorText: expect.stringContaining("bakery recommendations"),
        }),
      ]),
    );
  });

  it("rejects non-food service suggestions and locative try-there questions", async () => {
    const text = `[03/18/25, 8:40:00 PM] ~ A: Don't say - you don't have any space for dinner?
[03/18/25, 8:41:00 PM] ~ B: Try namma yatri
[04/01/25, 9:00:00 AM] ~ Akash: Come to Nenapu. You will love it
[04/01/25, 9:01:00 AM] ~ Rahul: I'm going to Nenapu tomorrow. What are the things that I should try there
[04/01/25, 9:02:00 AM] ~ Akash: jolada rotti, badnekayi, holige`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toEqual(
      expect.arrayContaining(["Namma Yatri", "There"]),
    );
  });

  it("rejects emphasis/admin phrases inside resolved request threads", async () => {
    const text = `[03/19/25, 7:08:44 PM] ~ Darshita: I'd love to know if you have any recs for food in Chandigarh
[03/19/25, 7:10:44 PM] ~ Akash: BEST NOTES EVER
[03/19/25, 7:12:44 PM] ~ Puneeth: Adding to Akash's list - Native Cocktail Room`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toEqual(
      expect.arrayContaining(["Ever", "Adding To Akash's List"]),
    );
    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([expect.objectContaining({ restaurant: "Native Cocktail Room" })]),
    );
  });

  it("does not attach city praise as a restaurant descriptor", async () => {
    const text = `[03/08/25, 8:13:17 PM] ~ Darshita: Hi hi does anyone have fun food recs for Jaipur?
[03/08/25, 8:17:25 PM] ~ Akash: Jaipur Iternary:
- [Nihari] Kallu Ki Nihari (Nihari and fried chicken), go before 8am or after 7pm, best batches
[03/08/25, 8:20:04 PM] ~ Darshita: Exactly! My favourite city. Would most likely retire there`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Kallu Ki Nihari",
          note: expect.not.stringContaining("retire there"),
        }),
      ]),
    );
  });

  it("inherits request context for explicit continuation lists and parses dish-from-place rows", async () => {
    const text = `[03/08/25, 8:13:17 PM] ~ Darshita: Hi hi does anyone have fun food recs for Jaipur? Lmk pls :) xx
[03/08/25, 8:17:25 PM] ~ Akash: Jaipur Iternary:
- [Nihari] Kallu Ki Nihari (Nihari and fried chicken), go before 8am or after 7pm, best batches
[03/08/25, 8:48:48 PM] ~ Mitasha: Wow it’s been a year! 😳
[03/08/25, 8:51:17 PM] ~ Mitasha: There’s also one real nice small Muslim place which had the most tender mutton with pulao. Very unassuming, basic place, forgot name :/
[03/08/25, 9:02:10 PM] ~ FOMO: Fav list! Adding 2 more -
Lassi from lassi wala
Meetha makkhan from gc dairy
[03/09/25, 11:24:26 AM] ~ Utkarsh: I’m in Mumbai, I’m taking some of that rasgulla tiramisu home; does anyone want the toffee cuz they’re on Swiggy so i can prob get some 💀`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Lassi Wala",
          city: "Jaipur",
          dishes: expect.arrayContaining(["lassi"]),
          anchorSender: "Darshita",
          contextSource: "continued_request",
          contextLines: "lines 1-1",
        }),
        expect.objectContaining({
          restaurant: "GC Dairy",
          city: "Jaipur",
          dishes: expect.arrayContaining(["meetha makkhan"]),
          anchorSender: "Darshita",
          contextSource: "continued_request",
        }),
      ]),
    );
    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toEqual(
      expect.arrayContaining(["Lassi From Lassi Wala", "Meetha Makkhan From Gc Dairy"]),
    );
    expect(allReviewRows(result).some((candidate) => /Mumbai|Swiggy/i.test(candidate.snippet ?? ""))).toBe(false);
  });

  it("parses right-side named places from location-hint hyphen recommendations", async () => {
    const text = `[09/08/25, 3:00:00 PM] ~ Priya: Hello frens. Top recommendations for sushi around indiranagar? Price no bar.
[09/08/25, 3:11:50 PM] ~ Sumedha: The one in Conrad - Mikusu is also very good,
[09/08/25, 3:12:50 PM] ~ Sumedha: It is expensive but the vibes are immaculate.`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toContain("The One In Conrad");
    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Mikusu",
          city: "Bengaluru",
          area: "Conrad",
          note: "is also very good,",
          displayNote: expect.stringMatching(/very good.*sushi|sushi.*very good/i),
          recommendationContext: expect.stringContaining("sushi around Indiranagar"),
          contextEvidenceLines: expect.arrayContaining(["lines 1-1"]),
          dishes: expect.arrayContaining(["sushi"]),
        }),
      ]),
    );
  });

  it("does not invent context for bare sentiment without request topic or dish evidence", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need food reccos in Bangalore
[06/15/26, 9:01:00 AM] ~ B: Try Plain Place. It is also very good.`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Plain Place",
          note: expect.stringContaining("also very good"),
          displayNote: expect.not.stringMatching(/for\s+\w+/i),
        }),
      ]),
    );
  });

  it("splits topic-led place lists and ignores anti-recommendations", async () => {
    const text = `[03/08/25, 8:13:17 PM] ~ Darshita: Hi hi does anyone have fun food recs for Jaipur?
[03/08/25, 8:17:25 PM] ~ Akash: Jaipur Iternary:
- [Lal Maas] Spice Court
[03/08/25, 9:02:13 PM] ~ Renuka: And a girl guide suggested these places - Laal maas places - Shikaar Bagh, Pratap Bhawan(pre order), Jai Club, Muhammadi.
Please avoid "Spice Court" for laal maas`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ restaurant: "Shikaar Bagh", city: "Jaipur", dishes: expect.arrayContaining(["lal maas"]) }),
        expect.objectContaining({ restaurant: "Pratap Bhawan", city: "Jaipur", dishes: expect.arrayContaining(["lal maas"]) }),
        expect.objectContaining({ restaurant: "Jai Club", city: "Jaipur", dishes: expect.arrayContaining(["lal maas"]) }),
        expect.objectContaining({ restaurant: "Muhammadi", city: "Jaipur", dishes: expect.arrayContaining(["lal maas"]) }),
      ]),
    );
    expect(
      allReviewRows(result).filter((candidate) => candidate.restaurant === "Spice Court" && /avoid/i.test(candidate.snippet ?? "")),
    ).toHaveLength(0);
  });

  it("does not treat broad prose as dish-from-place recommendations", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need food reccos in Bangalore
[06/15/26, 9:01:00 AM] ~ B: look at the sheer entries from goa - totally epic
[06/15/26, 9:02:00 AM] ~ C: Order the desserts from Burma Burma in that case`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toEqual(
      expect.arrayContaining(["Goa - Totally Epic", "Burma Burma In That Case"]),
    );
  });

  it("extracts anchored Korean cuisine replies from natural conversation", async () => {
    const text = `[06/10/25, 6:36:19 PM] ~ Sathwik Maanthini: Hey guys, want to eat some good authentic Korean food. Any recommendations?
[06/10/25, 6:38:31 PM] Akash LFC: Hi Seoul in Kalyan Nagar is great
[06/10/25, 6:39:08 PM] ~ Devika: Hae Kum Gang in Ashok Nagar is, too.
[06/10/25, 6:39:14 PM] ~ Aparajitha Sankar: Soo Ra Sang has been my go to since like 2005
[06/10/25, 6:39:55 PM] Akash LFC: Another fabulous place.
[06/10/25, 6:46:29 PM] Sandeep Dastarkhwan: - soora sang
- ⁠hae kum gang (their kimchi is solid)
[06/10/25, 7:02:13 PM] ~ Sathwik Maanthini: What about Arirang in kammanahalli
Did anyone try it
[06/10/25, 7:30:06 PM] ~ mudra: The owner is one funny lady with some furry friends. Sadly, the quality has been off my last 3 visits. But the vibes are unmatched.
She doesn't allow alcohol though.
[06/10/25, 7:32:20 PM] ~ mudra: Dams kitchen in Kalyan nagar is my gem. Good kimchi, and I judge a restaurant by their gimbap. Very fresh.
[06/11/25, 12:39:15 PM] ~ Aparajitha Sankar: Hello guys! Odd request but does anyone know any pure veg hotels close to Indiranagar?`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(result.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining("authentic Korean food"),
          requestKind: "restaurant_place",
          status: "unresolved",
          topics: expect.arrayContaining(["korean"]),
        }),
      ]),
    );
    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Hi Seoul",
          city: "Bengaluru",
          area: "Kalyan Nagar",
          tags: expect.arrayContaining(["korean"]),
          recommendationContext: expect.stringContaining("Korean food"),
          contextEvidenceLines: expect.arrayContaining(["lines 1-1"]),
        }),
        expect.objectContaining({
          restaurant: "Hae Kum Gang",
          area: "Ashok Nagar",
          tags: expect.arrayContaining(["korean"]),
          dishes: expect.arrayContaining(["kimchi"]),
        }),
        expect.objectContaining({
          restaurant: "Soo Ra Sang",
          tags: expect.arrayContaining(["korean"]),
          note: expect.stringContaining("go to since like 2005"),
        }),
        expect.objectContaining({
          restaurant: "Dams Kitchen",
          area: "Kalyan Nagar",
          tags: expect.arrayContaining(["korean"]),
          dishes: expect.arrayContaining(["kimchi", "gimbap"]),
        }),
      ]),
    );
    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toContain("Arirang");
    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toContain("Soora Sang");
    expect(allReviewRows(result).find((candidate) => candidate.restaurant === "Soo Ra Sang")?.note).not.toContain("tiny group");
    expect(allReviewRows(result).some((candidate) => /pure veg hotels/i.test(candidate.snippet ?? ""))).toBe(false);
  });

  it("anchors direct replies to general cuisine requests", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Want authentic Thai food. Any recommendations?
[06/15/26, 9:01:00 AM] ~ B: Thai House in Indiranagar is great`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Thai House",
          area: "Indiranagar",
          tags: expect.arrayContaining(["thai"]),
          recommendationContext: expect.stringContaining("Thai food"),
        }),
      ]),
    );
  });

  it("accepts bare cuisine list entries only under a cuisine request and does not leak context", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Any Japanese food reccos in Bangalore?
[06/15/26, 9:01:00 AM] ~ B: - matsuri
- azuki
[06/15/26, 1:00:00 PM] ~ C: Hello guys! Does anyone know any pure veg hotels close to Indiranagar?
[06/15/26, 1:01:00 PM] ~ D: - regenta inn`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ restaurant: "Matsuri", tags: expect.arrayContaining(["japanese"]) }),
        expect.objectContaining({ restaurant: "Azuki", tags: expect.arrayContaining(["japanese"]) }),
      ]),
    );
    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toContain("Regenta Inn");
  });

  it("does not reject mixed Gujarat reco requests as recipe threads and keeps named place evidence", async () => {
    const text = `[10/03/24, 12:16:30 PM] ~ Sandeep: not yet, but taking a note of this - will try it fosho
[10/03/24, 12:16:33 PM] FOMO: PLEASE go to this place called "Rasodu" in HSR
[10/03/24, 12:16:45 PM] FOMO: They've just opened & they serve authentic gujarati snacks
[10/03/24, 12:17:46 PM] ~ Sandeep: i'm in gujarat for another 5 days (daman & diu, somnath, jamnagar etc). please shoot any recos or must try recipes.

gujarati food has been on the sweeter side of things so far. i've been recommended kathiyawadi thali for some spicier flavours
[10/03/24, 12:18:20 PM] FOMO: Please eat the Sev khamani & kathiyawadi food but only from the dhabas!`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(result.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining("please shoot any recos"),
          requestKind: "restaurant_place",
          status: expect.not.stringMatching(/rejected/),
          topics: expect.arrayContaining(["gujarati"]),
        }),
      ]),
    );
    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Rasodu",
          area: "HSR",
          tags: expect.arrayContaining(["gujarati", "snacks"]),
        }),
      ]),
    );
  });

  it("classifies city-seeking requests and extracts Kolkata recommendation replies", async () => {
    const text = `[12/28/24, 9:23:38 AM] ~ Sumedha: Hi ♥️

I’m yet again in a new city and seeking recommendations.

🚕 Kolkata 🚕

Batao na?
[12/28/24, 9:31:16 AM] ~ Meghna: Bengali food at 6 Ballygunge Place or Kasturi
Calcutta Biryani at Royal or Arsalan
Indian style Chinese in Tung Fong or Bar-B-Que Flavours of Asia
[12/28/24, 9:33:59 AM] ~ Tanya: Also kookie jar is the best pastry shop in town! It’s better than flurys, although flurys has better vibes
[12/28/24, 9:39:31 AM] Harnidh: Sienna cafe. Rewant and shuili are so wonderful and what a lovely legacy.
[12/28/24, 9:42:01 AM] Rishav: Kusum rolls for authentic Kolkata chicken roll in the same area
[12/28/24, 9:42:45 AM] Rishav: If you’re going to Park Street but want Kolkata Chinese try flavours of china - pan fried chilli fish and chimney soup
[12/28/24, 9:45:53 AM] ~ Ojas: My biggest recommendation for sea food would be Bhojohori Manna at Kalighat (or any other branch).`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(result.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining("seeking recommendations"),
          requestKind: "restaurant_place",
          status: "unresolved",
          city: "Kolkata",
        }),
      ]),
    );
    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ restaurant: "6 Ballygunge Place", city: "Kolkata", tags: expect.arrayContaining(["bengali"]) }),
        expect.objectContaining({ restaurant: "Kasturi", city: "Kolkata", tags: expect.arrayContaining(["bengali"]) }),
        expect.objectContaining({ restaurant: "Royal", city: "Kolkata", dishes: expect.arrayContaining(["biryani"]) }),
        expect.objectContaining({ restaurant: "Arsalan", city: "Kolkata", dishes: expect.arrayContaining(["biryani"]) }),
        expect.objectContaining({ restaurant: "Tung Fong", city: "Kolkata", tags: expect.arrayContaining(["chinese"]) }),
        expect.objectContaining({ restaurant: "Bar-B-Que Flavours Of Asia", city: "Kolkata", tags: expect.arrayContaining(["chinese"]) }),
        expect.objectContaining({ restaurant: "Kookie Jar", city: "Kolkata", tags: expect.arrayContaining(["bakery"]) }),
        expect.objectContaining({ restaurant: "Sienna Cafe", city: "Kolkata", tags: expect.arrayContaining(["cafe"]) }),
        expect.objectContaining({ restaurant: "Kusum Rolls", city: "Kolkata" }),
        expect.objectContaining({ restaurant: "Flavours Of China", city: "Kolkata", tags: expect.arrayContaining(["chinese"]) }),
        expect.objectContaining({ restaurant: "Bhojohori Manna", city: "Kolkata", area: "Kalighat", tags: expect.arrayContaining(["seafood"]) }),
      ]),
    );
  });

  it("splits anchored bakery and neighborhood lunch list replies", async () => {
    const text = `[12/21/24, 11:01:11 PM] ~ Priyanshu: Do y'all have bakery recommendations(for cake) around cubbon, church street or Indiranagar?
[12/21/24, 11:14:31 PM] Abhishek: Lavonne, Klaa's doing a Christmas cake, Thom's
[12/21/24, 11:15:01 PM] ~ Tanya: Can try Amintri too
[12/21/24, 11:15:54 PM] Abhishek: For cake cake - Amintri, Smoor, Maki
[12/22/24, 12:31:55 AM] Aadarsh: Would add Lamara Patisserie to the list
[12/22/24, 12:38:07 AM] Aileen: And Junys
[06/14/25, 9:34:41 AM] ~ Paarth: Any good lunch recos in Jayanagar/JP Nagar?
(Pleasant spaces and good food-any cuisine)
[06/14/25, 10:18:22 AM] Abhinav: Nenapu, shokudo, saiko, si nonnas, mayuri are some of my favorites in the area.`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        ...["Lavonne", "Klaa's", "Thom's", "Amintri", "Smoor", "Maki", "Lamara Patisserie", "Junys"].map((restaurant) =>
          expect.objectContaining({ restaurant, tags: expect.arrayContaining(["bakery"]) }),
        ),
        ...["Nenapu", "Shokudo", "Saiko", "Si Nonnas", "Mayuri"].map((restaurant) =>
          expect.objectContaining({ restaurant, city: "Bengaluru" }),
        ),
      ]),
    );
  });

  it("extracts direct natural replies, replacement recommendations, and keeps question-only probes out", async () => {
    const text = `[01/23/25, 7:32:18 PM] Rahul: Looking for an excellent place for lunch tomorrow. Koramangala/Indiranagar types. Suggestions please ?
[01/23/25, 7:46:28 PM] Arathy: I've heard neon market is great!
[01/23/25, 7:47:04 PM] Aileen: 4Ps
[01/23/25, 7:47:36 PM] Rahul: Open to any. Just looking for awesome food
[01/23/25, 7:48:16 PM] Aileen: Walk in? If not you can also try walk in at Kopitah Lam for the pork dishes
Italian - Bologna (old restaurant, but top class)
[01/23/25, 7:48:34 PM] Aileen: Another classic with mind blowing food - Toast and Tonic
[01/23/25, 7:49:34 PM] Aileen: Navu?
Higher chances of getting in
[02/06/25, 10:38:56 AM] Sahiti: Hello folks, I’m looking for recommendations for a Valentine’s Day dinner. Please recommend places that are not cheesy + don’t miss with food & cocktails!
[02/06/25, 10:39:32 AM] Neha: Bastian was incredible - went last night. Could see the appeal for a romantic date night too hehe
[02/06/25, 1:01:59 PM] Aileen: I think Part Two Bangalore by Karan Upamanyu looks promising
[02/26/25, 1:40:40 PM] Ojas: Sumedha in the above list, I would recommend replacing Suryavanshi (it has lost its luster) with Kolhapur Cha Rassa in HSR for Kolhapuri/Maharashtrian food
[04/12/25, 10:28:38 AM] Sourav: Does anyone have any good vegetarian food places reco? - Ambience + good food ( Except Phurr)
[04/12/25, 10:29:15 AM] Renuka: Burma Burma forever...
[04/12/25, 10:31:31 AM] Renuka: There's Ishara which has great food - with enough options for vegetarians. The servers all have speech disability but fantastic service each time I went there.
[04/12/25, 10:46:32 AM] Sourav: Nice, this is the one in Phoenix Mall?
[04/12/25, 10:52:04 AM] Renuka: Yes. The mall has some really nice places to eat. Try Andrea's for their famed dessert -cremino. It's dessertgasmic. Their food is very good too but service is not great.
[04/12/25, 10:58:34 AM] Netra: Street Storyss!`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        ...["Neon Market", "4Ps", "Kopitah Lam", "Bologna", "Toast And Tonic", "Navu"].map((restaurant) =>
          expect.objectContaining({ restaurant, city: "Bengaluru" }),
        ),
        expect.objectContaining({ restaurant: "Bastian" }),
        expect.objectContaining({ restaurant: "Part Two Bangalore" }),
        expect.objectContaining({ restaurant: "Kolhapur Cha Rassa", area: "HSR", tags: expect.arrayContaining(["maharashtrian"]) }),
        expect.objectContaining({ restaurant: "Burma Burma", tags: expect.arrayContaining(["vegetarian"]) }),
        expect.objectContaining({ restaurant: "Ishara", tags: expect.arrayContaining(["vegetarian"]) }),
        expect.objectContaining({ restaurant: "Andrea's", dishes: expect.arrayContaining(["cremino"]) }),
        expect.objectContaining({ restaurant: "Street Storyss" }),
      ]),
    );
    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toEqual(
      expect.arrayContaining(["Suryavanshi", "Phoenix Mall"]),
    );
  });

  it("keeps link-only request replies parked and fixes sushi request topics", async () => {
    const text = `[04/15/25, 5:41:23 PM] Palak: Hello, could someone please recommend me some places to try out in Mangalore?
[04/15/25, 5:57:48 PM] Tarini: https://x.com/tarinilyy/status/1821540715786043650
This thread might help :) Some good reccos in the comments too
[09/08/25, 2:14:08 PM] Priya: Hello frens. Top recommendations for sushi around indiranagar? Price no bar.
[09/08/25, 3:11:50 PM] Sumedha: The one in Conrad - Mikusu is also very good,`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result).some((candidate) => /x\.com|twitter/i.test(candidate.snippet ?? ""))).toBe(false);
    expect(result.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining("Mangalore"),
          status: "unresolved",
        }),
        expect.objectContaining({
          text: expect.stringContaining("sushi around"),
          topics: expect.arrayContaining(["sushi"]),
          status: "unresolved",
        }),
      ]),
    );
    expect(result.requests.find((request) => /sushi around/i.test(request.text))?.topics).not.toContain("bar");
  });

  it("does not promote deterministic regex evidence when Ollama is disabled", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need food reccos in Bangalore
[06/15/26, 9:01:00 AM] ~ B: Vidyarthi Bhavan
CTR
[06/15/26, 9:02:00 AM] ~ C: Try Fervor. Best steak I have had in Bangalore`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.parked.map((candidate) => candidate.restaurant)).toEqual(
      expect.arrayContaining(["Vidyarthi Bhavan", "CTR", "Fervor"]),
    );
    expect(result.summary.finalCandidateCount).toBe(0);
    expect(result.summary.acceptedCount).toBe(0);
  });

  it("writes candidates and review files from Ollama-promoted rows only while preserving parked/debug artifacts", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need food reccos in Bangalore
[06/15/26, 9:01:00 AM] ~ B: Vidyarthi Bhavan
CTR
[06/15/26, 9:02:00 AM] ~ C: Try Fervor. Best steak I have had in Bangalore`;
    const fetcher = vi.fn(async () =>
      Response.json({
        message: {
          content: JSON.stringify({
            threadRole: "restaurant_recommendation",
            requestUpdates: [],
            mentions: [
              {
                mentionId: "m1",
                decision: "recommendation",
                restaurantSpan: "Fervor",
                dishSpans: ["steak"],
                cuisineTags: [],
                areaSpan: null,
                city: "Bengaluru",
                sentimentSpan: "Best steak I have had in Bangalore",
                anchorLineRefs: ["lines 1-1"],
                candidateLineRefs: ["lines 4-4"],
                supportLineRefs: [],
                reason: "Fervor is explicitly recommended with positive food evidence",
              },
              {
                mentionId: "m2",
                decision: "weak_possible",
                restaurantSpan: "Vidyarthi Bhavan",
                dishSpans: [],
                cuisineTags: [],
                areaSpan: null,
                city: "Bengaluru",
                sentimentSpan: null,
                anchorLineRefs: ["lines 1-1"],
                candidateLineRefs: ["lines 2-3"],
                supportLineRefs: [],
                reason: "Bare list entry without descriptor",
              },
            ],
          }),
        },
      }),
    );

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      fetcher,
      runId: "semantic-artifact-test",
    });
    const root = await mkdtemp(join(tmpdir(), "dastarkhwan-extract-"));
    const destination = await writeContextualReviewFiles(
      {
        inputName: "test.txt",
        inputHash: "test-hash",
        runId: "semantic-artifact-test",
        ...result,
      },
      root,
    );

    const candidates = JSON.parse(await readFile(join(destination, "candidates.json"), "utf8"));
    const parked = JSON.parse(await readFile(join(destination, "parked.json"), "utf8"));
    const debugEvidence = JSON.parse(await readFile(join(destination, "debug-evidence.json"), "utf8"));
    const review = await readFile(join(destination, "review.csv"), "utf8");
    const parkedReview = await readFile(join(destination, "parked-review.csv"), "utf8");

    expect(candidates.map((candidate: { restaurant: string }) => candidate.restaurant)).toEqual(["Fervor"]);
    expect(parked.map((candidate: { restaurant: string }) => candidate.restaurant)).toEqual(
      expect.arrayContaining(["Vidyarthi Bhavan"]),
    );
    expect(debugEvidence.length).toBeGreaterThanOrEqual(2);
    expect(review).toContain("Fervor");
    expect(review).not.toContain("Vidyarthi Bhavan");
    expect(parkedReview).toContain("Vidyarthi Bhavan");
  });

  it("does not persist Ollama-limit skipped threads into the resume checkpoint", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need food reccos in Bangalore
[06/15/26, 9:01:00 AM] ~ B: Try Fervor. Best steak I have had in Bangalore
[06/15/26, 11:00:00 AM] ~ C: Need dinner recommendations in Mumbai
[06/15/26, 11:01:00 AM] ~ D: Try Americano`;
    const fetcher = vi.fn(async () =>
      Response.json({
        message: {
          content: JSON.stringify({
            threadRole: "restaurant_recommendation",
            requestUpdates: [],
            mentions: [],
          }),
        },
      }),
    );
    const root = await mkdtemp(join(tmpdir(), "dastarkhwan-checkpoint-"));
    const checkpointPath = join(root, "extract-checkpoint.json");

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      fetcher,
      maxOllamaThreads: 1,
      checkpointPath,
      runId: "checkpoint-limit-test",
    });
    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));

    expect(result.rejected.map((item) => item.reason)).toContain("Ollama thread limit reached; semantic extraction skipped");
    expect(JSON.stringify(checkpoint)).not.toContain("Ollama thread limit reached");
    expect(checkpoint.threads).toHaveLength(1);
  });

  it("rejects casual replies even when Ollama returns them inside a recommendation thread", async () => {
    const text = `[02/02/25, 2:48:22 PM] Neha: They’re not fussy about cuisine just want a nice place with good food and mellow vibes
[02/02/25, 2:48:52 PM] Neha: In and around MG road, Brigade, Lavelle etc. city centre
[03/19/25, 7:19:08 PM] Abhishek: There are less I agree, but somethings are fucking kick ass
[03/19/25, 7:45:50 PM] Tarini: and parcel some for me
[03/19/25, 7:45:51 PM] Abhishek: Shit, finished already
[04/01/25, 7:38:31 PM] Abhishek: Hehe yes, we did the branding and architecture for them so you know they have taste 😂
[12/22/24, 12:00:00 AM] Abhishek: So good
[12/22/24, 12:00:01 AM] Abhishek: video omitted`;
    const badSpans = [
      "In And Around MG Road",
      "Brigade",
      "Lavelle Etc. City Centre",
      "But Somethings Are Fucking Kick Ass",
      "Parcel Some For Me",
      "Shit",
      "Finished Already",
      "Hehe Yes",
      "So Good",
      "Video Omitted",
    ];
    const fetcher = vi.fn(async () =>
      Response.json({
        message: {
          content: JSON.stringify({
            threadRole: "restaurant_recommendation",
            requestUpdates: [],
            mentions: badSpans.map((restaurantSpan, index) => ({
              mentionId: `bad-${index}`,
              decision: "recommendation",
              restaurantSpan,
              dishSpans: [],
              cuisineTags: [],
              areaSpan: null,
              city: "Bengaluru",
              sentimentSpan: null,
              anchorLineRefs: ["lines 1-1"],
              candidateLineRefs: [`lines ${index + 2}-${index + 2}`],
              supportLineRefs: [],
              reason: "model over-accepted a casual message",
            })),
          }),
        },
      }),
    );

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      fetcher,
      runId: "casual-rejection-test",
    });

    expect(result.candidates.map((candidate) => candidate.restaurant)).not.toEqual(expect.arrayContaining(badSpans));
    expect(result.parked.map((candidate) => candidate.restaurant)).not.toEqual(expect.arrayContaining(badSpans));
    expect(result.rejected.length).toBeGreaterThanOrEqual(badSpans.length);
  });

  it("rejects Ollama mentions when the restaurant span is absent from cited candidate lines", async () => {
    const text = `[07/04/24, 9:34:48 PM] Tarini: Let's go let's go! Happy to see we have some new faces to DC's next edition
[07/04/24, 9:35:48 PM] Tarini: I used to work with the lovely people at Local Ferment Co. Now I run this tiny little cafe called Muru Muru in Indiranagar`;
    const fetcher = vi.fn(async () =>
      Response.json({
        message: {
          content: JSON.stringify({
            threadRole: "restaurant_recommendation",
            requestUpdates: [],
            mentions: [
              {
                mentionId: "bad-span",
                decision: "recommendation",
                restaurantSpan: "Muru Muru",
                dishSpans: [],
                cuisineTags: [],
                areaSpan: null,
                city: "Kolkata",
                sentimentSpan: "I run this tiny little cafe called Muru Muru in Indiranagar",
                anchorLineRefs: ["lines 1-1"],
                candidateLineRefs: ["lines 1-1"],
                supportLineRefs: [],
                reason: "model cited the wrong candidate line",
              },
            ],
          }),
        },
      }),
    );

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      fetcher,
      runId: "span-validation-test",
    });

    expect(result.candidates.map((candidate) => candidate.restaurant)).not.toContain("Muru Muru");
    expect(result.parked.map((candidate) => candidate.restaurant)).not.toContain("Muru Muru");
    expect(result.rejected.map((item) => item.reason)).toEqual(
      expect.arrayContaining([expect.stringContaining("Restaurant span is absent from cited candidate lines")]),
    );
  });

  it("parks generic phrase false positives from travel and side-chatter inside anchored threads", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need food reccos in Bangalore
[06/15/26, 9:01:00 AM] ~ B: Heading to the misty hills of Darjeeling to jam on my guitar & relive some good memories. Dastarkhwan peeps are welcome to try the world famous tea.
[06/15/26, 9:02:00 AM] ~ C: Who all are interested? If there is quorum we can try to have a side adventure
[06/15/26, 9:03:00 AM] ~ D: Meanwhile is Fervor's veg potions good?
[06/15/26, 9:04:00 AM] ~ E: Wanted you to try the best cakes
[06/15/26, 9:05:00 AM] ~ F: Is anyone interested in going to try the new menu items at Navu`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toEqual(
      expect.arrayContaining([
        "The World Famous Tea",
        "To Have A Side Adventure",
        "Meanwhile",
        "The Best Cakes",
        "The New Menu Items At Navu",
      ]),
    );
  });

  it("normalizes sentiment-suffix names and rejects acknowledgements in anchored threads", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Hello people, Any recommendations for a cafe with outdoor seating vibe in or around Jayangar or JP nagar ?
[06/15/26, 9:01:00 AM] ~ B: juny's is amazing!
[06/15/26, 9:02:00 AM] ~ C: Done`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).toContain("Juny's");
    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toEqual(
      expect.arrayContaining(["Juny's Is Amazing", "Done"]),
    );
  });

  it("keeps one restaurant from a dish-heavy recommendation sentence instead of splitting dishes as places", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Recommendations for a great lunch place in Koramangala? Anything new and amazing?
[06/15/26, 9:01:00 AM] ~ B: Malgudi Mylari Mane, if you haven't been. Absolutely amazing! All the dishes ordered were so so good. Try mutton saru, ragi mudde, dosas, pulav, cucumber cooler, Chickmaglur coffee ice cream, jackfruit icecream.
[06/15/26, 9:02:00 AM] ~ C: still my absolute favorite, can’t recommend enough! Dindigul Ponram`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).toEqual(
      expect.arrayContaining(["Malgudi Mylari Mane", "Dindigul Ponram"]),
    );
    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toEqual(
      expect.arrayContaining([
        "Ragi Mudde",
        "Dosas",
        "Pulav",
        "Cucumber Cooler",
        "Chickmaglur Coffee Ice Cream",
        "Jackfruit Icecream",
        "Still My Absolute Favorite",
      ]),
    );
  });

  it("splits compact sushi praise into separate places instead of making the phrase a restaurant", async () => {
    const text = `[09/08/25, 2:14:08 PM] Priya: Hello frens. Top recommendations for sushi around indiranagar? Price no bar.
[09/08/25, 3:15:50 PM] Sushmita: Koko does good sushi
Also I believe Edo has recently revamped everything, and yeah it's one of the best I've been to back in the day.
[09/08/25, 3:16:50 PM] mudra: next to indiranagar cult`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ restaurant: "Koko", dishes: expect.arrayContaining(["sushi"]) }),
        expect.objectContaining({ restaurant: "Edo", dishes: expect.arrayContaining(["sushi"]) }),
      ]),
    );
    expect(allReviewRows(result).find((candidate) => candidate.restaurant === "Koko")?.tags).not.toContain("bar");
    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toEqual(
      expect.arrayContaining(["Koko Does Good Sushi", "Next To Indiranagar Cult"]),
    );
  });

  it("rejects packaging-design requests and acknowledgement praise as restaurant evidence", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Need quick recommendations for awesome takeaway packaging in Bangalore - could be design, feel, or functionally sound. Any cafes or restaurants?
[06/15/26, 9:01:00 AM] ~ B: Super! You know this already but I love the detailing on Juny’s - inside the box. It hits home for me.`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(allReviewRows(result).map((candidate) => candidate.restaurant)).not.toEqual(
      expect.arrayContaining(["Super", "Juny's"]),
    );
  });

  it("normalizes Brown Table location hints before dedupe", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ FOMO: Hi, any reccos for a good dinner place in & around malleshwaram? It should have alcohol/wine
[06/15/26, 9:01:00 AM] ~ Renuka: Try The Brown Table at Sadashivnagar. Great ambience, nice food and wine.
[06/15/26, 9:02:00 AM] ~ Sangeeta: The Brown Table at Sadashivnagar
[06/15/26, 9:03:00 AM] ~ Sangeeta: the tiramisu there is to die for`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    const brownTables = allReviewRows(result).filter((candidate) => /brown table/i.test(candidate.restaurant));
    expect(brownTables).toHaveLength(1);
    expect(brownTables[0]).toEqual(
      expect.objectContaining({
        restaurant: "The Brown Table",
        area: "Sadashivnagar",
        dishes: expect.arrayContaining(["tiramisu"]),
      }),
    );
  });

  it("does not let later restaurant recommendations bleed into Ishara or Andrea's notes", async () => {
    const text = `[04/12/25, 10:28:38 AM] Sourav: Does anyone have any good vegetarian food places reco? - Ambience + good food ( Except Phurr)
[04/12/25, 10:29:15 AM] Renuka: Burma Burma forever...
[04/12/25, 10:31:31 AM] Renuka: There's Ishara which has great food - with enough options for vegetarians. The servers all have speech disability but fantastic service each time I went there.
[04/12/25, 10:46:32 AM] Sourav: Nice, this is the one in Phoenix Mall?
[04/12/25, 10:52:04 AM] Renuka: Yes. The mall has some really nice places to eat. Try Andrea's for their famed dessert -cremino. It's dessertgasmic. Their food is very good too but service is not great.
[04/12/25, 10:53:04 AM] Renuka: The story is lovely too`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    const ishara = allReviewRows(result).find((candidate) => candidate.restaurant === "Ishara");
    const andreas = allReviewRows(result).find((candidate) => candidate.restaurant === "Andrea's");

    expect(ishara).toEqual(expect.objectContaining({ tags: expect.arrayContaining(["vegetarian"]) }));
    expect(ishara?.dishes).not.toContain("cremino");
    expect(ishara?.note).not.toMatch(/Andrea|cremino|dessertgasmic|The story/i);
    expect(ishara?.snippet).not.toMatch(/Andrea|cremino/i);

    expect(andreas).toEqual(expect.objectContaining({ dishes: expect.arrayContaining(["cremino"]) }));
    expect(andreas?.note).toMatch(/dessertgasmic|food is very good/i);
    expect(andreas?.note).not.toMatch(/The story/i);
    expect(andreas?.snippet).not.toMatch(/The story/i);
  });

  it("keeps catering and vouch/probe messages out of restaurant recovery requests", async () => {
    const text = `[06/15/26, 9:00:00 AM] ~ A: Any leads for a caterer who can do snacks for 40 people this weekend?
[06/15/26, 9:01:00 AM] ~ B: Can anyone vouch for sadhya at Coracle Cafe before I book?
[06/15/26, 9:02:00 AM] ~ C: Has anyone tried Phoenix Mall for veg food?`;

    const result = await extractContextualRecommendations(sortMessagesChronologically(parseWhatsAppText(text)), {
      useOllama: false,
      runId: "test-run",
    });

    expect(result.candidates).toHaveLength(0);
    expect(
      result.requests.filter((request) => /caterer|vouch|has anyone tried/i.test(request.text) && request.status === "unresolved"),
    ).toHaveLength(0);
  });
});
