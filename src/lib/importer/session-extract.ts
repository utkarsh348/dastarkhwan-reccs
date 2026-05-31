import { extractGoogleMapsUrls } from "../location";
import { firstName, slugify, stableHash, titleCase } from "../slug";
import { chatJson, type LlmClientOptions } from "./llm-client";
import {
  sessionExtractionSchema,
  type ExtractedRecommendationCandidate,
  type ExtractedRecommendationRaw,
  type ReccSession,
  type SessionExtractionResult,
} from "./schemas";
import type { WhatsAppMessage } from "./whatsapp";
import { pipelineLog } from "./pipeline-log";

const FEW_SHOT = `
Example multi-venue message â€” produce TWO rows:
"Next to Irani cafe, there is Gandhi Cold Drinks. Love their drinks. It's called Irani Cafe only in the old city. Try maska bun and chai."
â†’ Row 1: Irani Cafe, note about maska bun/chai/old city only
â†’ Row 2: Gandhi Cold Drinks, note about drinks/heat only

Example list message â€” skip category headings:
"Good nonveg -\\nMirch Masala (kebabs, SG Road)\\nLolo Roso (prawn dumplings, Bodakdev)"
â†’ Row 1: Mirch Masala
â†’ Row 2: Lolo Roso
(Do NOT create a row for "Good nonveg")
`.trim();

export type SessionExtractOptions = LlmClientOptions & {
  extractModel?: string;
};

function formatSessionTranscript(messages: WhatsAppMessage[], indices: number[]): string {
  return indices
    .map((index) => {
      const message = messages[index]!;
      return `[${index}] ${message.timestamp.toISOString()} ${firstName(message.sender)}: ${message.body.replace(/\s+/g, " ")}`;
    })
    .join("\n");
}

function truncate(value: string, length = 180): string {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function extractSessionRecommendations(
  session: ReccSession,
  messages: WhatsAppMessage[],
  options: SessionExtractOptions = {},
): Promise<SessionExtractionResult> {
  const started = Date.now();
  const extractModel = options.extractModel ?? process.env.OLLAMA_EXTRACT_MODEL ?? options.model;

  const transcript = formatSessionTranscript(messages, session.messageIndices);
  const areaHint = session.area ? `Area context: ${session.area}.` : "";

  const prompt = `Extract food/restaurant recommendations from this WhatsApp thread.

Session city (use for all rows unless a venue is clearly elsewhere): ${session.city}
${areaHint}

Return JSON:
{"recommendations":[{"restaurant":"","city":"","area":null,"address":null,"dishes":[],"tags":[],"note":"","snippet":"","sourceName":"","sourceMessageIndices":[],"googleMapsUrl":null,"confidence":0.8}]}

Rules:
- One row per distinct restaurant, cafe, bakery, food stall, or food truck.
- Split multi-venue messages â€” each venue gets its own scoped note (dishes/context for THAT place only).
- Do NOT include the original request message as a restaurant.
- Do NOT include category headings ("Good nonveg", "Best chai") as restaurants.
- note = factual recommendation scoped to that venue (what to try, area, tips). Not the whole message.
- snippet = short faithful quote from the source message(s).
- sourceMessageIndices = array of message [index] numbers that support this row.
- dishes/tags = concrete items mentioned for that venue (lowercase).
- Ignore intros, thank-yous, memes, "image omitted", and general chat.

${FEW_SHOT}

Transcript:
${transcript}`;

  try {
    const { data, model } = await chatJson(prompt, sessionExtractionSchema, {
      ...options,
      model: extractModel,
      system:
        "Extract structured restaurant recommendations from WhatsApp chat. One venue per object. Return strict JSON only.",
    });

    return {
      sessionId: session.id,
      recommendations: data.recommendations,
      model,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      sessionId: session.id,
      recommendations: [],
      model: extractModel ?? options.model ?? "unknown",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unknown extraction error",
    };
  }
}

function resolveReferenceMessages(
  raw: ExtractedRecommendationRaw,
  session: ReccSession,
  messages: WhatsAppMessage[],
): WhatsAppMessage[] {
  const fromIndices = (raw.sourceMessageIndices ?? [])
    .map((index) => messages[index])
    .filter(Boolean) as WhatsAppMessage[];

  if (fromIndices.length > 0) return fromIndices;

  const snippet = raw.snippet?.toLowerCase();
  if (snippet) {
    const match = session.messageIndices
      .map((index) => messages[index]!)
      .find((message) => message.body.toLowerCase().includes(snippet.slice(0, 48)));
    if (match) return [match];
  }

  const source = raw.sourceName?.toLowerCase();
  if (source) {
    const match = session.messageIndices
      .map((index) => messages[index]!)
      .find((message) => firstName(message.sender).toLowerCase() === firstName(source).toLowerCase());
    if (match) return [match];
  }

  const fallback = messages[session.requestMessageIndex + 1];
  return fallback ? [fallback] : [messages[session.requestMessageIndex]!];
}

export function rawToCandidate(
  raw: ExtractedRecommendationRaw,
  session: ReccSession,
  messages: WhatsAppMessage[],
): ExtractedRecommendationCandidate | null {
  const restaurant = titleCase(raw.restaurant.trim());
  if (!restaurant || restaurant.length < 2) return null;

  const references = resolveReferenceMessages(raw, session, messages);
  const reference = references[0]!;
  const city = raw.city?.trim() ? titleCase(raw.city.trim()) : session.city;
  const restaurantSlug = slugify(restaurant);
  const citySlug = slugify(city);
  const snippet = truncate(raw.snippet ?? reference.body);
  const sourceName = firstName(raw.sourceName ?? reference.sender);

  const mapsFromRefs =
    references.map((message) => extractGoogleMapsUrls(message.body)[0]).find(Boolean) ?? null;

  const lineStart = Math.min(...references.map((message) => message.lineStart));
  const lineEnd = Math.max(...references.map((message) => message.lineEnd));

  return {
    restaurant,
    restaurantSlug,
    city,
    citySlug,
    area: raw.area ? titleCase(raw.area) : session.area,
    address: raw.address ?? null,
    dishes: unique((raw.dishes ?? []).map((dish) => dish.toLowerCase())),
    tags: unique((raw.tags ?? []).map((tag) => tag.toLowerCase())),
    note: raw.note ? truncate(raw.note, 220) : null,
    snippet,
    sourceName,
    confidence: raw.confidence ?? 0.65,
    googleMapsUrl: raw.googleMapsUrl ?? mapsFromRefs,
    sourceDate: reference.timestamp.toISOString(),
    rawRefLabel: `session ${session.id} lines ${lineStart}-${lineEnd}`,
    sourceHash: stableHash([restaurantSlug, citySlug, sourceName, snippet, reference.timestamp.toISOString()]),
    sessionId: session.id,
    sourceMessageIndices: raw.sourceMessageIndices,
  };
}

export async function extractAllSessions(
  sessions: ReccSession[],
  messages: WhatsAppMessage[],
  options: SessionExtractOptions = {},
): Promise<{ extractions: SessionExtractionResult[]; candidates: ExtractedRecommendationCandidate[] }> {
  const extractions: SessionExtractionResult[] = [];
  const candidates: ExtractedRecommendationCandidate[] = [];

  const total = sessions.length;
  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index]!;
    const n = index + 1;
    pipelineLog(
      `Pass B: extracting session ${n}/${total} (${session.city}, ${session.messageIndices.length} messages)...`,
    );
    const result = await extractSessionRecommendations(session, messages, options);
    extractions.push(result);
    pipelineLog(
      `Pass B: session ${n}/${total} done in ${result.durationMs}ms (${result.recommendations.length} rows${result.error ? `, error: ${result.error}` : ""})`,
    );

    for (const raw of result.recommendations) {
      const candidate = rawToCandidate(raw, session, messages);
      if (candidate) candidates.push(candidate);
    }
  }

  return { extractions, candidates };
}
