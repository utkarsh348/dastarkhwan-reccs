import { describe, expect, it, vi } from "vitest";
import { parseWhatsAppText, sortMessagesChronologically } from "./whatsapp";
import { extractRecommendationCandidatesWithOllama } from "./ollama";

const sample = `[09/05/26, 10:34:01 AM] ~ Udayan: Need your top food reccos in Srinagar
[09/05/26, 11:47:59 AM] ~ Gokul Ratakonda: Ahdoos their wazwan was awesome`;

describe("Ollama recommendation extraction", () => {
  it("uses qwen3:4b by default and parses structured recommendations", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        message: {
          content: JSON.stringify({
            recommendations: [
              {
                restaurant: "Ahdoos",
                city: "Srinagar",
                dishes: ["wazwan"],
                tags: ["wazwan"],
                note: "Wazwan was awesome",
                snippet: "Ahdoos their wazwan was awesome",
                sourceName: "Gokul",
                confidence: 0.9,
              },
            ],
          }),
        },
      }),
    );

    const result = await extractRecommendationCandidatesWithOllama(
      sortMessagesChronologically(parseWhatsAppText(sample)),
      { fetcher },
    );

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("qwen3:4b");
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          restaurant: "Ahdoos",
          city: "Srinagar",
          dishes: ["wazwan"],
          sourceName: "Gokul",
        }),
      ]),
    );
    expect(result.model).toBe("qwen3:4b");
  });

  it("falls back to llama3.2:3b when the primary model fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("missing model", { status: 404 }))
      .mockResolvedValueOnce(
        Response.json({
          message: {
            content: JSON.stringify({
              recommendations: [
                {
                  restaurant: "Ahdoos",
                  city: "Srinagar",
                  snippet: "Ahdoos their wazwan was awesome",
                  sourceName: "Gokul",
                  confidence: 0.85,
                },
              ],
            }),
          },
        }),
      );

    const result = await extractRecommendationCandidatesWithOllama(
      sortMessagesChronologically(parseWhatsAppText(sample)),
      { fetcher },
    );

    const firstBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(firstBody.model).toBe("qwen3:4b");
    expect(secondBody.model).toBe("llama3.2:3b");
    expect(result.model).toBe("llama3.2:3b");
  });
});
