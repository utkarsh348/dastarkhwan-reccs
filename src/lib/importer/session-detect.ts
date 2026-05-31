import { titleCase } from "../slug";
import { chatJson, type LlmClientOptions } from "./llm-client";
import {
  sessionConfirmBatchSchema,
  type ReccSession,
  type ReccSessionEndReason,
  type SessionConfirmResult,
} from "./schemas";
import type { WhatsAppMessage } from "./whatsapp";

const REQUEST_PATTERN =
  /\b(recc|recco|recommend(?:ation)?s?|food\s+(?:recc|spot|place|joint)|where\s+(?:to\s+)?(?:eat|go)|(?:top|best)\s+food|help\s+with\s+food|suggestions?\s+(?:for|in)|need(?:ed)?\s+(?:your\s+)?(?:top\s+)?(?:food\s+)?recc|looking\s+for\s+(?:food|places|restaurants)|any\s+(?:good\s+)?(?:places|restaurants|cafes?)\s+(?:in|for|around))\b/i;

const LOCATION_PATTERN =
  /\b(?:in|for|around|at|visiting|trip\s+to|going\s+to|near)\s+([A-Z][\p{L}]+(?:\s+[A-Z][\p{L}]+){0,2})/u;

const BATCH_SIZE = 6;
const CONTEXT_NEIGHBORS = 2;

export type SessionDetectOptions = LlmClientOptions & {
  idleHours?: number;
  maxMessages?: number;
};

export function scanRequestCandidates(messages: WhatsAppMessage[]): number[] {
  const indices: number[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const body = messages[index]!.body.replace(/\s+/g, " ").trim();
    if (body.length > 600) continue;
    if (!REQUEST_PATTERN.test(body)) continue;
    if (!LOCATION_PATTERN.test(body)) continue;
    if (/^hello|^hi\b|^hey\b/i.test(body) && body.length > 400 && !/\?\s*$/.test(body)) continue;
    indices.push(index);
  }
  return indices;
}

function formatMessageBlock(messages: WhatsAppMessage[], centerIndex: number): string {
  const lines: string[] = [];
  for (let offset = -CONTEXT_NEIGHBORS; offset <= CONTEXT_NEIGHBORS; offset += 1) {
    const index = centerIndex + offset;
    const message = messages[index];
    if (!message) continue;
    const marker = index === centerIndex ? ">>>" : "   ";
    lines.push(
      `${marker} [${index}] ${message.timestamp.toISOString()} ${message.sender}: ${message.body.replace(/\s+/g, " ").slice(0, 280)}`,
    );
  }
  return lines.join("\n");
}

export async function confirmRequestCandidates(
  messages: WhatsAppMessage[],
  candidateIndices: number[],
  options: SessionDetectOptions = {},
): Promise<{ results: SessionConfirmResult[]; model: string }> {
  if (candidateIndices.length === 0) {
    return { results: [], model: options.model ?? process.env.OLLAMA_MODEL ?? "qwen3:4b" };
  }

  const allResults: SessionConfirmResult[] = [];
  let usedModel = options.model ?? process.env.OLLAMA_MODEL ?? "qwen3:4b";

  for (let start = 0; start < candidateIndices.length; start += BATCH_SIZE) {
    const batch = candidateIndices.slice(start, start + BATCH_SIZE);
    const blocks = batch
      .map((index) => `Candidate messageIndex=${index}:\n${formatMessageBlock(messages, index)}`)
      .join("\n\n");

    const prompt = `For each candidate below, decide if the >>> marked message is someone ASKING the group for food/restaurant recommendations for a city or area.

Return JSON: {"results":[{"messageIndex":0,"isRequest":true,"city":"Srinagar","area":null,"confidence":0.9}]}

Rules:
- isRequest=true only for explicit asks ("reccos in X", "where to eat in X", "recommendations for X").
- isRequest=false for intros, sharing one's own experience, replying with a single rec without being prompted, announcements, or off-topic.
- city = the place they want recommendations FOR (title case). Use area/neighborhood when the ask is hyperlocal (e.g. Koramangala) and city when clear.
- Do not mark "I recommend X in Y" as a request — that is an answer, not a ask.

Candidates:
${blocks}`;

    const { data, model } = await chatJson(prompt, sessionConfirmBatchSchema, {
      ...options,
      system: "Classify WhatsApp messages as food recommendation requests. Return strict JSON only.",
    });
    usedModel = model;

    for (const result of data.results) {
      if (!batch.includes(result.messageIndex)) continue;
      allResults.push(result);
    }
  }

  return { results: allResults, model: usedModel };
}

export function buildSessions(
  messages: WhatsAppMessage[],
  confirmed: SessionConfirmResult[],
  options: Pick<SessionDetectOptions, "idleHours" | "maxMessages"> = {},
): ReccSession[] {
  const idleMs = (options.idleHours ?? Number(process.env.SESSION_IDLE_HOURS ?? 48)) * 60 * 60 * 1000;
  const maxMessages = options.maxMessages ?? Number(process.env.SESSION_MAX_MESSAGES ?? 120);

  const requests = confirmed
    .filter((item) => item.isRequest && item.city?.trim())
    .sort((left, right) => left.messageIndex - right.messageIndex);

  const sessions: ReccSession[] = [];

  for (let i = 0; i < requests.length; i += 1) {
    const request = requests[i]!;
    const nextRequestIndex = requests[i + 1]?.messageIndex ?? messages.length;
    const startIndex = request.messageIndex;
    const indices: number[] = [];

    for (let index = startIndex; index < messages.length && index < nextRequestIndex; index += 1) {
      if (indices.length >= maxMessages) break;

      if (indices.length > 0) {
        const prev = messages[indices.at(-1)!]!;
        const current = messages[index]!;
        const gap = current.timestamp.getTime() - prev.timestamp.getTime();
        if (gap > idleMs) break;
      }

      indices.push(index);
    }

    let endReason: ReccSessionEndReason = "end_of_chat";
    if (nextRequestIndex < messages.length && indices.at(-1)! >= nextRequestIndex - 1) {
      endReason = "next_request";
    } else if (indices.length >= maxMessages) {
      endReason = "max_window";
    } else if (indices.length > 0) {
      const last = messages[indices.at(-1)!]!;
      const after = messages[indices.at(-1)! + 1];
      if (after && after.timestamp.getTime() - last.timestamp.getTime() > idleMs) {
        endReason = "idle_gap";
      }
    }

    const city = titleCase(request.city!.trim());
    sessions.push({
      id: `session-${startIndex}-${slugifyCity(city)}`,
      city,
      area: request.area ? titleCase(request.area.trim()) : null,
      requestMessageIndex: startIndex,
      messageIndices: indices,
      startedAt: messages[startIndex]!.timestamp.toISOString(),
      endedAt: messages[indices.at(-1)!]!.timestamp.toISOString(),
      endReason,
    });
  }

  return sessions;
}

function slugifyCity(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export async function detectReccSessions(
  messages: WhatsAppMessage[],
  options: SessionDetectOptions = {},
): Promise<{ sessions: ReccSession[]; model: string; candidateCount: number }> {
  const candidates = scanRequestCandidates(messages);
  const { results, model } = await confirmRequestCandidates(messages, candidates, options);
  const sessions = buildSessions(messages, results, options);
  return { sessions, model, candidateCount: candidates.length };
}
