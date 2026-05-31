import { describe, expect, it, vi } from "vitest";
import { dedupeCandidates } from "./dedupe";
import { buildSessions, confirmRequestCandidates, scanRequestCandidates } from "./session-detect";
import { extractSessionRecommendations, rawToCandidate } from "./session-extract";
import { runImportPipelineFromText } from "./pipeline";
import { parseWhatsAppText, sortMessagesChronologically } from "./whatsapp";

const srinagarCluster = `[09/05/26, 2:47:22 PM] ~ Abhishek Durani: Moon Light - The Walnut Fudge Shop, Srinagar
[09/05/26, 11:47:59 AM] ~ Gokul Ratakonda: Ahdoos their wazwan was awesome
[09/05/26, 10:35:01 AM] ~ Hetall: Chai Jaai - MUST go for the best kashmiri beverages & snacks
[09/05/26, 10:34:01 AM] ~ Udayan: Need your top food reccos in Srinagar. Here for a few days.`;

const ahmedabadCluster = `[30/05/26, 10:25:59 AM] ~ Ankita: Guys can you help with food recommendations in Ahmedabad
[30/05/26, 10:45:56 AM] ~ Abhishek Durani: For great veg gujju thalis:
1. Gordhan Thal
2. Agashiye
[30/05/26, 10:47:16 AM] ~ Pranav Joshi: Good nonveg -
Mirch Masala (good kebabs, SG Road)
Lolo Roso (best prawn dumplings, Bodakdev)`;

function mockFetcher(responses: unknown[]) {
  let call = 0;
  return vi.fn(async () => {
    const payload = responses[call] ?? responses.at(-1);
    call += 1;
    return Response.json({ message: { content: JSON.stringify(payload) } });
  });
}

describe("session pipeline", () => {
  it("finds recc request candidates in synthetic chat", () => {
    const messages = sortMessagesChronologically(parseWhatsAppText(srinagarCluster));
    const candidates = scanRequestCandidates(messages);
    expect(candidates.length).toBeGreaterThan(0);
    expect(messages[candidates[0]!]?.body).toMatch(/Srinagar/i);
  });

  it("builds a session window from confirmed request", () => {
    const messages = sortMessagesChronologically(parseWhatsAppText(srinagarCluster));
    const sessions = buildSessions(messages, [
      { messageIndex: 0, isRequest: true, city: "Srinagar", area: null, confidence: 0.9 },
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.city).toBe("Srinagar");
    expect(sessions[0]?.messageIndices.length).toBeGreaterThan(1);
  });

  it("extracts scoped recommendations from a session via mocked Ollama", async () => {
    const messages = sortMessagesChronologically(parseWhatsAppText(srinagarCluster));
    const sessions = buildSessions(messages, [
      { messageIndex: 0, isRequest: true, city: "Srinagar", area: null, confidence: 0.9 },
    ]);
    const fetcher = mockFetcher([
      {
        recommendations: [
          {
            restaurant: "Ahdoos",
            city: "Srinagar",
            dishes: ["wazwan"],
            tags: ["wazwan"],
            note: "Wazwan was awesome",
            snippet: "Ahdoos their wazwan was awesome",
            sourceName: "Gokul",
            sourceMessageIndices: [2],
            confidence: 0.9,
          },
          {
            restaurant: "Chai Jaai",
            city: "Srinagar",
            dishes: ["kashmiri beverages", "snacks"],
            note: "Best kashmiri beverages and snacks",
            snippet: "Chai Jaai - MUST go",
            sourceName: "Hetall",
            sourceMessageIndices: [1],
            confidence: 0.88,
          },
        ],
      },
    ]);

    const result = await extractSessionRecommendations(sessions[0]!, messages, { fetcher });
    expect(result.recommendations).toHaveLength(2);

    const candidates = result.recommendations
      .map((raw) => rawToCandidate(raw, sessions[0]!, messages))
      .filter(Boolean);
    const deduped = dedupeCandidates(candidates as NonNullable<(typeof candidates)[number]>[]);

    expect(deduped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ restaurant: "Ahdoos", city: "Srinagar" }),
        expect.objectContaining({ restaurant: "Chai Jaai", city: "Srinagar" }),
      ]),
    );
  });

  it("confirms request batches with mocked Ollama", async () => {
    const messages = sortMessagesChronologically(parseWhatsAppText(ahmedabadCluster));
    const candidates = scanRequestCandidates(messages);
    const fetcher = mockFetcher([
      {
        results: [{ messageIndex: candidates[0], isRequest: true, city: "Ahmedabad", confidence: 0.95 }],
      },
    ]);

    const { results } = await confirmRequestCandidates(messages, candidates, { fetcher });
    expect(results.some((item) => item.isRequest && item.city === "Ahmedabad")).toBe(true);
  });

  it("runs end-to-end pipeline with mocked session detect and extract", async () => {
    const fetcher = mockFetcher([
      { results: [{ messageIndex: 0, isRequest: true, city: "Srinagar", confidence: 0.95 }] },
      {
        recommendations: [
          {
            restaurant: "Ahdoos",
            city: "Srinagar",
            dishes: ["wazwan"],
            note: "Wazwan was awesome",
            snippet: "Ahdoos their wazwan was awesome",
            sourceName: "Gokul",
            sourceMessageIndices: [2],
            confidence: 0.9,
          },
        ],
      },
    ]);

    const result = await runImportPipelineFromText("test.txt", srinagarCluster, { fetcher });
    expect(result.sessionCount).toBe(1);
    expect(result.candidates.some((row) => row.restaurant === "Ahdoos")).toBe(true);
  });

  it("keeps separate sessions for two city asks", () => {
    const text = `${srinagarCluster}\n[31/05/26, 10:00:00 AM] ~ Ankita: food recommendations in Ahmedabad please`;
    const messages = sortMessagesChronologically(parseWhatsAppText(text));
    const sessions = buildSessions(
      messages,
      [
        { messageIndex: 0, isRequest: true, city: "Srinagar", confidence: 0.9 },
        { messageIndex: messages.length - 1, isRequest: true, city: "Ahmedabad", confidence: 0.9 },
      ],
      { maxMessages: 50 },
    );
    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.city)).toEqual(["Srinagar", "Ahmedabad"]);
  });
});
