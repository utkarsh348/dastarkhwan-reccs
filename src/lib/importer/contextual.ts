import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, dirname, isAbsolute, join } from "path";
import { z } from "zod";
import { firstName, slugify, stableHash, titleCase } from "../slug";
import type { RecommendationInput } from "../types";
import {
  clusterMessages,
  parseWhatsAppText,
  readWhatsAppInput,
  sortMessagesChronologically,
  type WhatsAppMessage,
} from "./whatsapp";

export type ThreadClassification = "recommendation_thread" | "food_discussion" | "event_admin" | "irrelevant";
export type ConfidenceBand = "likely_importable" | "review_required" | "rejected";
export type AnchorType = "request_reply" | "self_initiated" | "curated_list" | "maps_link";
export type RequestKind = "restaurant_place" | "dish_at_known_place" | "recipe" | "event" | "other";
export type RequestStatus = "resolved" | "unresolved" | "rejected";

export type ContextualThread = {
  id: string;
  broadClusterIndex: number;
  classification: ThreadClassification;
  reason: string;
  cityContext: string | null;
  start: string;
  end: string;
  lineStart: number;
  lineEnd: number;
  messageCount: number;
  senders: string[];
  messages: WhatsAppMessage[];
  continuedRequest?: ThreadContinuation;
};

export type ReviewCandidate = RecommendationInput & {
  restaurantSlug: string;
  citySlug: string;
  threadId: string;
  confidenceBand: ConfidenceBand;
  extractionMethod: "ollama" | "deterministic";
  evidenceLines: string;
  needsDescriptor: boolean;
  descriptorReason: string | null;
  descriptorSource: "google_places_needed" | "community_note";
  anchorType: AnchorType;
  anchorConfidence: number;
  anchorReason: string;
  anchorText: string;
  anchorSender: string | null;
  anchorLines: string;
  candidateLines: string;
  requestId: string | null;
  requestStatus: RequestStatus | null;
  supportingLines: string[];
  contextSource: "same_thread" | "continued_request";
  contextLines: string | null;
  displayNote: string | null;
  recommendationContext: string | null;
  contextEvidenceLines: string[];
  reviewStatus?: "final" | "parked";
  promotionReason?: string;
  promotionEvidenceIds?: string[];
  semanticDecision?: SemanticMention["decision"];
};

export type ThreadFrame = {
  threadId: string;
  messages: WhatsAppMessage[];
  activeRequest: RequestFrame | null;
  continuationOf: RequestFrame | null;
  cityFrame: string | null;
  topicFrame: string[];
  blockedReason: string | null;
};

type RequestFrame = {
  requestId: string;
  city: string | null;
  areas: string[];
  topics: string[];
  requestKind: RequestKind;
  lineRefs: string;
  expiresAtThreadBoundary: boolean;
};

type SemanticThreadRole =
  | "restaurant_recommendation"
  | "food_discussion"
  | "recipe_home_cooking"
  | "event_admin"
  | "generic_chatter";

type SemanticThreadResult = {
  threadRole: SemanticThreadRole;
  requestUpdates: RequestFrame[];
  mentions: SemanticMention[];
};

type SemanticMention = {
  mentionId: string;
  decision: "recommendation" | "weak_possible" | "reject";
  restaurantSpan: string | null;
  dishSpans: string[];
  cuisineTags: string[];
  areaSpan: string | null;
  city: string | null;
  sentimentSpan: string | null;
  anchorLineRefs: string[];
  candidateLineRefs: string[];
  supportLineRefs: string[];
  reason: string;
};

export type DebugEvidenceCandidate = {
  evidenceId: string;
  threadId: string;
  restaurant: string;
  candidateLines: string;
  anchorType: AnchorType;
  anchorLines: string;
  semanticDecision: SemanticMention["decision"];
  semanticReason: string;
  normalizedStatus: NormalizedMention["status"];
  normalizedRestaurant: string | null;
  normalizedArea: string | null;
  normalizedDishes: string[];
  normalizedTags: string[];
  promotionDecision: "promote" | "park" | "reject";
  promotionReason: string;
  utteranceRole: UtteranceRole;
  score: number;
  snippet: string | null;
};

type UtteranceRole =
  | "place_recommendation"
  | "place_list"
  | "location_hint"
  | "supporting_sentiment"
  | "question_probe"
  | "acknowledgement"
  | "logistics"
  | "media_omitted"
  | "generic_chatter";

type NormalizedMention = {
  status: "clean" | "ambiguous" | "reject";
  restaurant: string | null;
  area: string | null;
  dishes: string[];
  tags: string[];
  noteFragment: string | null;
  rejectionReason: string | null;
  transformations: string[];
};

type PromotionDecision = {
  decision: "promote" | "park" | "reject";
  reason: string;
  score: number;
  candidate?: ReviewCandidate;
  evidence: DebugEvidenceCandidate;
  rejected?: RejectedExtraction;
};

type ThreadContinuation = {
  requestThreadId: string;
  requestMessage: WhatsAppMessage;
  cityContext: string | null;
  contextLines: string;
};

export type ExtractionRequest = {
  requestId: string;
  threadId: string;
  sender: string;
  text: string;
  lines: string;
  timestamp: string;
  city: string | null;
  areas: string[];
  topics: string[];
  requestKind: RequestKind;
  status: RequestStatus;
  resolvedCandidateIds: string[];
  rejectionReason?: string;
};

export type RejectedExtraction = {
  threadId: string;
  reason: string;
  classification: ThreadClassification;
  snippet: string;
  start: string;
  end: string;
  lineStart: number;
  lineEnd: number;
};

export type ContextualExtractionResult = {
  inputName: string;
  inputHash: string;
  runId: string;
  model: string;
  parsedMessageCount: number;
  broadClusterCount: number;
  threadCount: number;
  candidates: ReviewCandidate[];
  parked: ReviewCandidate[];
  debugEvidence: DebugEvidenceCandidate[];
  requests: ExtractionRequest[];
  rejected: RejectedExtraction[];
  clusters: Omit<ContextualThread, "messages">[];
  summary: ExtractionSummary;
};

export type ExtractionSummary = {
  runId: string;
  inputName: string;
  parsedMessageCount: number;
  broadClusterCount: number;
  threadCount: number;
  requestCount: number;
  resolvedRequestCount: number;
  unresolvedRequestCount: number;
  finalCandidateCount: number;
  parkedCount: number;
  debugMentionCount: number;
  acceptedCount: number;
  rejectedCount: number;
  byCity: Record<string, number>;
  byTag: Record<string, number>;
  byDish: Record<string, number>;
  byConfidenceBand: Record<ConfidenceBand, number>;
  rejectionReasons: Record<string, number>;
  parkReasons: Record<string, number>;
  promotionReasons: Record<string, number>;
};

type ContextualExtractionOptions = {
  endpoint?: string;
  model?: string;
  fallbackModel?: string;
  fetcher?: typeof fetch;
  useOllama?: boolean;
  maxOllamaThreads?: number;
  ollamaTimeoutMs?: number;
  runId?: string;
  checkpointPath?: string;
  onProgress?: (message: string) => void;
};

type ThreadCheckpoint = {
  threadId: string;
  model: string;
  candidates: ReviewCandidate[];
  requests?: ExtractionRequest[];
  rejected: RejectedExtraction[];
};

type ExtractionCheckpoint = {
  inputHash: string;
  runId: string;
  anchorVersion?: string;
  promptVersion?: string;
  threads: ThreadCheckpoint[];
};

type CandidateAnchor = {
  anchorType: AnchorType;
  anchorConfidence: number;
  anchorReason: string;
  anchorText: string;
  anchorSender: string | null;
  anchorLines: string;
  requestId?: string | null;
  contextSource?: "same_thread" | "continued_request";
  contextLines?: string | null;
};

type AnchorableCandidate = {
  restaurant: string;
  snippet?: string | null;
  note?: string | null;
  googleMapsUrl?: string | null;
  sourceName?: string | null;
  rawRefLabel: string;
};

type StructuredCandidateInput = {
  restaurant: string;
  message: WhatsAppMessage;
  city?: string | null;
  area?: string | null;
  dishes?: string[];
  tags?: string[];
  note?: string | null;
  snippet?: string | null;
  confidence?: number;
  anchor?: CandidateAnchor | null;
};

const ANCHOR_VERSION = "semantic-v2";
const PROMPT_VERSION = "thread-semantic-v1";

const cityAliases = new Map<string, string>([
  ["ahmedabad", "Ahmedabad"],
  ["amdavad", "Ahmedabad"],
  ["srinagar", "Srinagar"],
  ["kolkata", "Kolkata"],
  ["calcutta", "Kolkata"],
  ["bangalore", "Bengaluru"],
  ["bengaluru", "Bengaluru"],
  ["blore", "Bengaluru"],
  ["mumbai", "Mumbai"],
  ["bombay", "Mumbai"],
  ["delhi", "Delhi"],
  ["new delhi", "Delhi"],
  ["pune", "Pune"],
  ["goa", "Goa"],
  ["hyderabad", "Hyderabad"],
  ["chennai", "Chennai"],
  ["jaipur", "Jaipur"],
  ["lucknow", "Lucknow"],
  ["kochi", "Kochi"],
  ["cochin", "Kochi"],
  ["indore", "Indore"],
  ["mysore", "Mysuru"],
  ["mysuru", "Mysuru"],
  ["chandigarh", "Chandigarh"],
  ["noida", "Noida"],
  ["gurgaon", "Gurugram"],
  ["gurugram", "Gurugram"],
  ["mangalore", "Mangalore"],
]);

const areaAliases = new Map<string, string>([
  ["koramangala", "Bengaluru"],
  ["koramangla", "Bengaluru"],
  ["korams", "Bengaluru"],
  ["hsr", "Bengaluru"],
  ["hsr layout", "Bengaluru"],
  ["indiranagar", "Bengaluru"],
  ["indranagar", "Bengaluru"],
  ["jayanagar", "Bengaluru"],
  ["kalyan nagar", "Bengaluru"],
  ["ashok nagar", "Bengaluru"],
  ["south bangalore", "Bengaluru"],
  ["bandra", "Mumbai"],
  ["park street", "Kolkata"],
  ["lal darwaza", "Ahmedabad"],
  ["bodakdev", "Ahmedabad"],
  ["sg road", "Ahmedabad"],
  ["s g road", "Ahmedabad"],
]);

const cuisinePatterns = [
  ["korean", /\bkorean\b/i],
  ["thai", /\bthai\b/i],
  ["japanese", /\bjapanese\b/i],
  ["chinese", /\bchinese\b/i],
  ["vietnamese", /\bvietnamese\b/i],
  ["burmese", /\bburmese\b/i],
  ["italian", /\bitalian\b/i],
  ["mexican", /\bmexican\b/i],
  ["asian", /\basian\b/i],
  ["gujarati", /\bgujarati|kathiyawadi\b/i],
  ["bengali", /\bbengali\b/i],
  ["maharashtrian", /\bmaharashtrian|kolhapuri\b/i],
] as const;

const foodSignalPattern =
  /\b(recco|recos?|recs?|recommend|recommendations?|restaurant|cafe|cafes|bakery|breakfast|brunch|lunch|dinner|buffet|food|eat|eating|try|go to|must go|must try|thali|biryani|wazwan|chai|coffee|dessert|ice ?cream|kebab|pasta|pizza|sushi|sea ?food|vegetarian|veg|korean|thai|japanese|chinese|vietnamese|burmese|italian|mexican|asian|gujarati|kathiyawadi|bengali|maharashtrian|kolhapuri|maps\.app|google\.com\/maps|goo\.gl\/maps)\b/i;
const askPattern = /\b(where|what|which|any|need|looking for|suggest|recommend|recco|recos?|recs?)\b.*\b(food|eat|restaurant|cafe|breakfast|lunch|dinner|buffet|bakery|places?|spots?|sushi|sea ?food|vegetarian|veg)\b/i;
const recommendationPattern =
  /\b(try|go to|must try|must go|don't miss|dont miss|called|there is|there's|recommendation|recommend|love their|famous for|best|good|great|amazing|worth|fav list|adding \d+ more|suggested these places)\b/i;
const foodPlacePattern =
  /\b(restaurant|cafe|bakery|stall|joint|bar|bistro|kitchen|diner|eatery|dhaba|canteen|hotel|sweet shop|ice ?cream|pizzeria)\b/i;
const dishWordPattern =
  /\b(dosa|dosas|sambar|kebab|kebabs|dumplings?|prawn|fish|soup|chai|coffee|bun|maska|pav|thali|calzone|pizza|pasta|ice ?creams?|sourdough|kulfi|kulfan|wazwan|fudge|beverages?|snacks?|lassi|makkhan|makhan|sushi|kimchi|gimbap|kimbap|ramen|ramyun)\b/i;
const eventPattern =
  /\b(rsvp|rsvps|attending|finali[sz]ed|volunteer|session|workshop|meetup|registration|joining|participants?|google form|zoom|venue|hmi|host|event|agenda|calendar)\b/i;
const recipePattern = /\b(recipe|recipes|cook|cooking|ingredients?|method|add salt|pan|oven|boil|fry|we make it|mango)\b/i;
const antiRecommendationPattern =
  /\b(if your list says|will reject|reject it|avoid|don't go|dont go|worst|terrible|not good|wasn'?t that great|closed|shut down)\b/i;
const eventAdminBlockPattern =
  /\b(final(?:i[sz]ed)?\s+guest\s*list|guestlist|guest\s*list|rsvps?|attendees?|participants?|ticket|tickets?|tix|book(?:ed|ing)?|venue|attendance|attendence|meet\s*ups?|reach on time|parking|dress code|requested to join|joined using|added\s+~|you added|pinned a message)\b/i;
const foodRequestPattern =
  /\b(food recommendations?|reccos?|recos?|recs?|recommendations?|where (?:do|should|can)|where to|looking for|need|suggest|help with)\b[\s\S]{0,120}\b(food|eat|eating|restaurant|cafe|bakery|breakfast|brunch|lunch|dinner|buffet|bread|dosa|thali|biryani|chai|coffee|dessert|places?|spots?|sushi|sea ?food|vegetarian|veg|korean|thai|japanese|chinese|vietnamese|burmese|italian|mexican|asian|gujarati|kathiyawadi|bengali|maharashtrian|kolhapuri)\b/i;
const selfRecommendationCuePattern =
  /\b(try|do try|definitely try|go to|must go|must try|don't miss|dont miss|please go to|have (?:the )?.{0,30}\bat|my go to place is|there is|there's|called|love their|famous for|best known for|is (?:also )?(?:very )?(?:good|great|awesome|incredible)|shouldn'?t miss)\b/i;
const foodListHeadingPattern =
  /\b(good nonveg|good non-veg|best desserts?|best chai|late night treats?|thalis?|great veg|vegetarian|sea ?food|sushi|for indian|for breakfast|for lunch|for dinner|cafes?|bakeries|restaurants?|food spots?)\b/i;

const ollamaItemSchema = z.object({
  restaurant: z.string().min(1),
  city: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  dishes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  note: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
  sourceName: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.7),
});

const ollamaPayloadSchema = z.object({
  recommendations: z.array(ollamaItemSchema).default([]),
  rejected: z.array(z.object({ reason: z.string(), snippet: z.string().optional().default("") })).default([]),
});

const semanticMentionSchema = z.object({
  mentionId: z.string().optional(),
  decision: z.enum(["recommendation", "weak_possible", "reject"]),
  restaurantSpan: z.string().nullable().optional(),
  dishSpans: z.array(z.string()).default([]),
  cuisineTags: z.array(z.string()).default([]),
  areaSpan: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  sentimentSpan: z.string().nullable().optional(),
  anchorLineRefs: z.array(z.string()).default([]),
  candidateLineRefs: z.array(z.string()).default([]),
  supportLineRefs: z.array(z.string()).default([]),
  reason: z.string().default("No reason provided"),
});

const semanticThreadPayloadSchema = z.object({
  threadRole: z.enum(["restaurant_recommendation", "food_discussion", "recipe_home_cooking", "event_admin", "generic_chatter"]),
  requestUpdates: z.array(z.unknown()).default([]),
  mentions: z.array(semanticMentionSchema).default([]),
});

export async function previewContextualExtraction(
  inputPath: string,
  options: ContextualExtractionOptions = {},
): Promise<ContextualExtractionResult> {
  const text = await readWhatsAppInput(inputPath);
  const messages = sortMessagesChronologically(parseWhatsAppText(text));
  const runId = options.runId ?? createRunId();
  const inputHash = stableHash([inputPath, text]);
  if (options.useOllama !== false) {
    await preflightOllama(options);
  }
  const extraction = await extractContextualRecommendations(messages, {
    ...options,
    runId,
    checkpointPath:
      options.checkpointPath ?? join(process.cwd(), "data", "extraction-runs", runId, "extract-checkpoint.json"),
  }, inputHash);

  return {
    inputName: basename(inputPath),
    inputHash,
    runId,
    ...extraction,
  };
}

export async function extractContextualRecommendations(
  messages: WhatsAppMessage[],
  options: ContextualExtractionOptions = {},
  inputHash = stableHash(messages.map((message) => `${message.lineStart}:${message.body}`)),
): Promise<Omit<ContextualExtractionResult, "inputName" | "inputHash" | "runId">> {
  const broadClusters = clusterMessages(messages, 8);
  const threads = broadClusters.flatMap((cluster, index) => linkContinuationThreads(segmentCluster(cluster, index)));
  const checkpoints = await loadCheckpoint(options.checkpointPath, inputHash);
  const completed = new Map((checkpoints?.threads ?? []).map((thread) => [thread.threadId, thread]));
  const candidates: ReviewCandidate[] = [];
  const requestsFromCheckpoints: ExtractionRequest[] = [];
  const rejected: RejectedExtraction[] = [];
  let model = options.model ?? process.env.OLLAMA_MODEL ?? "qwen3:4b";
  let ollamaThreads = 0;
  const maxOllamaThreads = options.maxOllamaThreads ?? Number.POSITIVE_INFINITY;

  for (const [index, thread] of threads.entries()) {
    const existing = completed.get(thread.id);
    if (existing) {
      candidates.push(...existing.candidates);
      requestsFromCheckpoints.push(...(existing.requests ?? []));
      rejected.push(...existing.rejected);
      model = existing.model || model;
      continue;
    }

    const isRecommendationThread = thread.classification === "recommendation_thread";
    const shouldUseOllama = isRecommendationThread && options.useOllama !== false && ollamaThreads < maxOllamaThreads;
    const hitOllamaLimit = isRecommendationThread && options.useOllama !== false && !shouldUseOllama;
    const checkpoint: ThreadCheckpoint =
      !isRecommendationThread
        ? { threadId: thread.id, model, candidates: [], requests: buildThreadRequests(thread), rejected: [rejectThread(thread, thread.reason)] }
        : hitOllamaLimit
          ? { threadId: thread.id, model, candidates: [], requests: buildThreadRequests(thread), rejected: [rejectThread(thread, "Ollama thread limit reached; semantic extraction skipped")] }
          : await extractThreadWithFallback(thread, {
              ...options,
              useOllama: shouldUseOllama,
            }, index, threads.length);

    if (checkpoint.model) model = checkpoint.model;
    if (shouldUseOllama) {
      ollamaThreads += 1;
    }
    candidates.push(...checkpoint.candidates);
    requestsFromCheckpoints.push(...(checkpoint.requests ?? []));
    rejected.push(...checkpoint.rejected);
    if (!hitOllamaLimit) {
      completed.set(thread.id, checkpoint);
      await saveCheckpoint(options.checkpointPath, inputHash, options.runId ?? "adhoc", [...completed.values()]);
    }
  }

  const interpreted = interpretAndPromoteCandidates(
    finalizeDisplayMetadata(attachSupportingNotes(dedupeReviewCandidates(candidates), threads)),
    threads,
  );
  const requests = resolveRequestStatuses(
    dedupeRequests(requestsFromCheckpoints.length ? requestsFromCheckpoints : threads.flatMap(buildThreadRequests)),
    interpreted.promoted,
  );
  const clusters = threads.map((thread) => {
    const { messages, ...withoutMessages } = thread;
    void messages;
    return withoutMessages;
  });
  const runId = options.runId ?? "adhoc";

  return {
    model,
    parsedMessageCount: messages.length,
    broadClusterCount: broadClusters.length,
    threadCount: threads.length,
    candidates: interpreted.promoted,
    parked: interpreted.parked,
    debugEvidence: interpreted.debugEvidence,
    requests,
    rejected: [...rejected, ...interpreted.rejected],
    clusters,
    summary: summarizeExtraction(
      runId,
      "whatsapp",
      messages.length,
      broadClusters.length,
      threads.length,
      interpreted.promoted,
      interpreted.parked,
      interpreted.debugEvidence,
      requests,
      [...rejected, ...interpreted.rejected],
    ),
  };
}

export async function writeContextualReviewFiles(result: ContextualExtractionResult, root = "data/extraction-runs") {
  const destination = join(isAbsolute(root) ? root : join(process.cwd(), root), result.runId);
  await mkdir(destination, { recursive: true });
  await Promise.all([
    writeJson(join(destination, "summary.json"), result.summary),
    writeJson(join(destination, "requests.json"), result.requests),
    writeJson(join(destination, "candidates.json"), result.candidates),
    writeJson(join(destination, "parked.json"), result.parked),
    writeJson(join(destination, "debug-evidence.json"), result.debugEvidence),
    writeJson(join(destination, "rejected.json"), result.rejected),
    writeJson(join(destination, "clusters.json"), result.clusters),
    writeFile(join(destination, "review.csv"), toReviewCsv(result.candidates), "utf8"),
    writeFile(join(destination, "parked-review.csv"), toReviewCsv(result.parked), "utf8"),
  ]);
  return destination;
}

function segmentCluster(cluster: WhatsAppMessage[], broadClusterIndex: number): ContextualThread[] {
  const segments: WhatsAppMessage[][] = [];
  let current: WhatsAppMessage[] = [];

  cluster.forEach((message) => {
    const previous = current.at(-1);
    const gapMinutes = previous ? (message.timestamp.getTime() - previous.timestamp.getTime()) / 60000 : 0;
    const startsNewAsk = current.length > 0 && isAsk(message.body);
    const startsContinuation = current.some((item) => isFoodRecommendationRequest(item.body)) && isContinuationStart(message.body);
    const longGap = current.length > 0 && gapMinutes > 75;
    const eventSwitch = current.length > 0 && isEventAdmin(message.body) && !hasFoodSignal(message.body);

    if (startsNewAsk || startsContinuation || longGap || eventSwitch) {
      segments.push(current);
      current = [];
    }
    current.push(message);
  });

  if (current.length > 0) segments.push(current);
  return segments.map((messagesInThread, index) => createThread(messagesInThread, broadClusterIndex, index));
}

function linkContinuationThreads(threads: ContextualThread[]): ContextualThread[] {
  let activeRequest: { thread: ContextualThread; message: WhatsAppMessage } | null = null;
  for (const thread of threads) {
    const request = thread.messages.find((message) => isFoodRecommendationRequest(message.body));
    if (request) {
      activeRequest = { thread, message: request };
      continue;
    }

    if (!activeRequest) continue;
    if (!isContinuationThread(thread)) continue;
    if (thread.classification === "event_admin") continue;

    const gapMinutes = (new Date(thread.start).getTime() - new Date(activeRequest.thread.end).getTime()) / 60000;
    if (gapMinutes < 0 || gapMinutes > 180) continue;

    thread.classification = "recommendation_thread";
    thread.reason = "Explicit continuation of a prior food/place request";
    thread.continuedRequest = {
      requestThreadId: activeRequest.thread.id,
      requestMessage: activeRequest.message,
      cityContext: activeRequest.thread.cityContext,
      contextLines: lineLabel(activeRequest.message),
    };
  }
  return threads;
}

function isContinuationThread(thread: ContextualThread) {
  if (thread.messages.some((message) => isEventAdmin(message.body) && !hasFoodSignal(message.body))) return false;
  const text = threadText(thread.messages);
  return /\b(fav(?:ourite)? list|adding\s+\d+\s+more|adding to .+ list|would add|looks promising|also|forgot about this|girl guide suggested|suggested these places)\b/i.test(text) || /^\s*and\s+[A-Z0-9]/u.test(text);
}

function isContinuationStart(body: string) {
  return /^\s*(there'?s also|i went to|i think .+ looks promising|fav(?:ourite)? list|adding\s+\d+\s+more|adding to .+ list|would add|and\s+[A-Z0-9]|and a .+ suggested)\b/iu.test(body);
}

function createThread(messages: WhatsAppMessage[], broadClusterIndex: number, threadIndex: number): ContextualThread {
  const text = threadText(messages);
  const classification = classifyThread(text, messages);
  const cityContext = inferThreadCity(text);
  const first = messages[0]!;
  const last = messages.at(-1)!;
  return {
    id: `cluster-${broadClusterIndex + 1}-thread-${threadIndex + 1}`,
    broadClusterIndex,
    classification: classification.classification,
    reason: classification.reason,
    cityContext,
    start: first.timestamp.toISOString(),
    end: last.timestamp.toISOString(),
    lineStart: first.lineStart,
    lineEnd: last.lineEnd,
    messageCount: messages.length,
    senders: [...new Set(messages.map((message) => firstName(message.sender)))],
    messages,
  };
}

function classifyThread(text: string, messages: WhatsAppMessage[]): { classification: ThreadClassification; reason: string } {
  const foodSignals = countMatches(text, foodSignalPattern);
  const recommendationSignals = countMatches(text, recommendationPattern);
  const eventSignals = countMatches(text, eventPattern);
  const hasAsk = messages.some((message) => isAsk(message.body));
  const hasRestaurantLine = messages.some((message) => looksLikeRestaurantLine(message.body));
  const hasCuisineListReply = hasAnchoredCuisineListReply(messages);

  if (eventSignals > 0 && eventSignals >= foodSignals && !hasRestaurantLine) {
    return { classification: "event_admin", reason: "Event/admin language dominates this mini-thread" };
  }
  if (recipePattern.test(text) && !hasAsk && !hasRestaurantLine) {
    return { classification: "food_discussion", reason: "Food discussion or recipe without a place recommendation" };
  }
  if ((hasAsk || foodSignals > 0) && (recommendationSignals > 0 || hasRestaurantLine || hasCuisineListReply)) {
    return { classification: "recommendation_thread", reason: "Contains food context plus place recommendation signals" };
  }
  if (foodSignals > 0) {
    return { classification: "food_discussion", reason: "Food-related chatter without a concrete place recommendation" };
  }
  return { classification: "irrelevant", reason: "No food recommendation signal" };
}

function hasAnchoredCuisineListReply(messages: WhatsAppMessage[]) {
  const requestIndex = messages.findIndex((message) => isCuisineRecommendationRequest(message.body));
  if (requestIndex < 0) return false;
  return messages.slice(requestIndex + 1).some((message) =>
    message.body.split(/\r?\n/).some((line) => {
      line = stripExtractionControls(line);
      const clean = line.replace(/^\s*(?:[-*â€¢â ]|\d+\.)\s*/, "").replace(/\(.+?\)/g, "").trim();
      return /^\s*(?:[-*â€¢â ]|\d+\.)\s*/u.test(line) && isPlausibleCuisineRestaurantName(titleCase(clean));
    }),
  );
}

async function extractThreadWithFallback(
  thread: ContextualThread,
  options: ContextualExtractionOptions,
  index: number,
  total: number,
): Promise<ThreadCheckpoint> {
  options.onProgress?.(`Thread ${index + 1}/${total}: ${thread.id}`);
  const requests = buildThreadRequests(thread);
  if (options.useOllama === false) {
    const deterministic = extractDeterministic(thread);
    return {
      threadId: thread.id,
      model: "deterministic",
      candidates: deterministic,
      requests,
      rejected: deterministic.length > 0 ? [] : [rejectThread(thread, "Ollama disabled; deterministic evidence cannot promote final candidates")],
    };
  }

  try {
    const semantic = await extractFromThreadWithOllama(thread, options);
    return {
      threadId: thread.id,
      model: semantic.model,
      candidates: semantic.candidates,
      requests,
      rejected: semantic.rejected,
    };
  } catch (error) {
    return {
      threadId: thread.id,
      model: `${options.model ?? "qwen3:4b"} (ollama failed)`,
      candidates: [],
      requests,
      rejected: [
        rejectThread(
          thread,
          `Ollama extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ],
    };
  }
}

async function extractFromThreadWithOllama(
  thread: ContextualThread,
  options: ContextualExtractionOptions,
): Promise<ThreadCheckpoint> {
  const endpoint = options.endpoint ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const model = options.model ?? process.env.OLLAMA_MODEL ?? "qwen3:4b";
  const fallbackModel = options.fallbackModel ?? process.env.OLLAMA_FALLBACK_MODEL ?? "llama3.2:3b";
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.ollamaTimeoutMs ?? Number(process.env.EXTRACT_OLLAMA_TIMEOUT_MS ?? 45_000);

  try {
    return await requestThreadExtraction(thread, endpoint, model, fetcher, timeoutMs);
  } catch (primaryError) {
    if (fallbackModel === model) throw primaryError;
    return requestThreadExtraction(thread, endpoint, fallbackModel, fetcher, timeoutMs);
  }
}

async function preflightOllama(options: ContextualExtractionOptions) {
  const endpoint = options.endpoint ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const model = options.model ?? process.env.OLLAMA_MODEL ?? "qwen3:4b";
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.ollamaTimeoutMs ?? Number(process.env.EXTRACT_OLLAMA_TIMEOUT_MS ?? 45_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(`${endpoint.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        think: false,
        options: { temperature: 0, num_ctx: 512 },
        messages: [
          { role: "user", content: "Respond with a JSON object containing a boolean field named ok set to true. Do not include an error field." },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Ollama ${model} preflight failed with ${response.status}`);
    const payload = (await response.json()) as { message?: { content?: string }; response?: string };
    const raw = payload.message?.content ?? payload.response ?? "";
    const parsed = z.object({ ok: z.literal(true) }).safeParse(JSON.parse(extractJson(raw)));
    if (!parsed.success) throw new Error(`Ollama ${model} preflight did not return expected JSON`);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Ollama ${model} preflight timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestThreadExtraction(
  thread: ContextualThread,
  endpoint: string,
  model: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<ThreadCheckpoint> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetcher(`${endpoint.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        think: false,
        options: { temperature: 0, num_ctx: Number(process.env.OLLAMA_NUM_CTX ?? 8192) },
        messages: [
          {
            role: "system",
            content:
              "Extract only concrete restaurant, cafe, bakery, stall, or food-place recommendations from WhatsApp mini-threads. Return strict JSON only. Prefer precision over recall.",
          },
          { role: "user", content: buildThreadPrompt(thread) },
        ],
      }),
    });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Ollama ${model} timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`Ollama ${model} failed with ${response.status}`);
  const payload = (await response.json()) as { message?: { content?: string }; response?: string };
  const raw = payload.message?.content ?? payload.response ?? "";
  const json = JSON.parse(extractJson(raw));
  const semantic = semanticThreadPayloadSchema.safeParse(json);
  if (semantic.success && Array.isArray(json.mentions)) {
    const candidates = semantic.data.mentions
      .map((mention) => candidateFromSemanticMention(mention, thread, model))
      .filter((candidate): candidate is ReviewCandidate => Boolean(candidate));
    const rejected = semantic.data.mentions
      .filter((mention) => mention.decision === "reject" || !semanticMentionHasCitedRestaurantSpan(mention, thread))
      .map((mention) =>
        rejectThread(
          thread,
          mention.decision === "reject"
            ? mention.reason || "Rejected by local model"
            : `Restaurant span is absent from cited candidate lines: ${mention.restaurantSpan}`,
          mention.restaurantSpan ?? "",
        ),
      );
    return { threadId: thread.id, model, candidates, requests: buildThreadRequests(thread), rejected };
  }

  const parsed = ollamaPayloadSchema.parse(json);
  const candidates = parsed.recommendations
    .map((item) => candidateFromOllamaItem(item, thread, model))
    .filter((candidate): candidate is ReviewCandidate => Boolean(candidate));
  const rejected = parsed.rejected.map((item) => rejectThread(thread, item.reason || "Rejected by local model", item.snippet));
  return { threadId: thread.id, model, candidates, requests: buildThreadRequests(thread), rejected };
}

function buildThreadPrompt(thread: ContextualThread) {
  const transcript = thread.messages
    .map((message) => `[${message.timestamp.toISOString()} lines ${message.lineStart}-${message.lineEnd}] ${firstName(message.sender)}: ${message.body.replace(/\s+/g, " ")}`)
    .join("\n");

  return `Return JSON shaped as {"threadRole":"restaurant_recommendation","requestUpdates":[],"mentions":[{"mentionId":"m1","decision":"recommendation","restaurantSpan":"Exact place name from text","dishSpans":[],"cuisineTags":[],"areaSpan":null,"city":null,"sentimentSpan":"exact praise or recommendation phrase","anchorLineRefs":["lines 1-1"],"candidateLineRefs":["lines 2-2"],"supportLineRefs":[],"reason":"why this is a real recommendation"}]}.

Rules:
- Include only actual restaurant/cafe/bakery/stall/food-place recommendations.
- Read the whole mini-thread and split separate places into separate mentions.
- Use exact text spans from the transcript; do not invent restaurants.
- Use decision "weak_possible" for plausible but ambiguous evidence and "reject" for casual replies, people names, dishes-only, locations-only, event/admin, recipes, or question-only probes.
- Use nearby context inside this mini-thread only; do not infer city from unrelated capitalized phrases.
- If the city is unclear, use "Unsorted".
- Put cuisines/topics in tags and specific foods in dishes.
- Reject event logistics, RSVP/name lists, recipes, generic food opinions, and request-only messages.
- Keep snippets short and quote only the evidence.

Known city context if present: ${thread.cityContext ?? "none"}.

Transcript:
${transcript}`;
}

function candidateFromOllamaItem(
  item: z.infer<typeof ollamaItemSchema>,
  thread: ContextualThread,
  model: string,
): ReviewCandidate | null {
  const restaurant = normalizeDeterministicRestaurantName(item.restaurant);
  if (isBadRestaurantName(restaurant)) return null;
  const city = normalizeCity(item.city) ?? thread.cityContext ?? "Unsorted";
  const reference = findReferenceMessage(thread, item.snippet ?? item.restaurant, item.sourceName ?? undefined);
  const confidence = clampConfidence(item.confidence);
  if (confidence < 0.65) return null;
  const rawRefLabel = `lines ${reference.lineStart}-${reference.lineEnd}`;
  const anchor = resolveCandidateAnchor(
    {
      restaurant,
      snippet: item.snippet ?? reference.body,
      note: item.note ?? null,
      googleMapsUrl: null,
      sourceName: firstName(item.sourceName ?? reference.sender),
      rawRefLabel,
    },
    thread,
    reference,
  );
  if (!anchor) return null;
  return buildReviewCandidate({
    restaurant,
    city,
    area: item.area ? titleCase(item.area) : inferArea(threadText(thread.messages)),
    address: item.address ?? null,
    dishes: item.dishes,
    tags: item.tags,
    note: item.note ?? null,
    snippet: item.snippet ?? reference.body,
    sourceName: firstName(item.sourceName ?? reference.sender),
    confidence,
    sourceDate: reference.timestamp.toISOString(),
    rawRefLabel,
    threadId: thread.id,
    method: model === "deterministic" ? "deterministic" : "ollama",
    anchor,
  });
}

function candidateFromSemanticMention(
  mention: z.infer<typeof semanticMentionSchema>,
  thread: ContextualThread,
  model: string,
): ReviewCandidate | null {
  if (mention.decision === "reject" || !mention.restaurantSpan?.trim()) return null;
  if (!semanticMentionHasCitedRestaurantSpan(mention, thread)) return null;
  const restaurant = normalizeDeterministicRestaurantName(mention.restaurantSpan);
  if (isBadRestaurantName(restaurant) || isImpossibleFinalRestaurantName(restaurant)) return null;
  const reference = findReferenceMessageByLines(thread, mention.candidateLineRefs) ?? findReferenceMessage(thread, mention.restaurantSpan);
  const rawRefLabel = mention.candidateLineRefs[0] ?? lineLabel(reference);
  const snippet = sentence(reference.body);
  const anchor = resolveCandidateAnchor(
    {
      restaurant,
      snippet,
      note: mention.sentimentSpan ?? null,
      googleMapsUrl: null,
      sourceName: firstName(reference.sender),
      rawRefLabel,
    },
    thread,
    reference,
  );
  if (!anchor) return null;
  return {
    ...buildReviewCandidate({
    restaurant,
    city: normalizeCity(mention.city) ?? thread.cityContext ?? thread.continuedRequest?.cityContext ?? "Unsorted",
    area: mention.areaSpan ? titleCase(mention.areaSpan) : inferArea(reference.body),
    address: null,
    dishes: mention.dishSpans.map(normalizeDishName),
    tags: cleanList(mention.cuisineTags),
    note: mention.sentimentSpan ?? null,
    snippet,
    sourceName: firstName(reference.sender),
    confidence: mention.decision === "recommendation" ? 0.86 : 0.72,
    sourceDate: reference.timestamp.toISOString(),
    rawRefLabel,
    threadId: thread.id,
    method: model === "deterministic" ? "deterministic" : "ollama",
    anchor,
    }),
    semanticDecision: mention.decision,
  };
}

function semanticMentionHasCitedRestaurantSpan(mention: z.infer<typeof semanticMentionSchema>, thread: ContextualThread) {
  if (!mention.restaurantSpan?.trim()) return false;
  const citedText = candidateLineText(thread, mention.candidateLineRefs);
  if (!citedText) return false;
  return normalizeLoose(citedText).includes(normalizeLoose(mention.restaurantSpan));
}

function candidateLineText(thread: ContextualThread, lineRefs: string[]) {
  const refs = lineRefs.map(parseLineRef).filter((ref): ref is { start: number; end: number } => Boolean(ref));
  if (!refs.length) return "";
  return thread.messages
    .filter((message) => refs.some((ref) => message.lineStart <= ref.end && message.lineEnd >= ref.start))
    .map((message) => message.body)
    .join("\n");
}

function findReferenceMessageByLines(thread: ContextualThread, lineRefs: string[]) {
  for (const ref of lineRefs) {
    const parsed = parseLineRef(ref);
    if (!parsed) continue;
    const message = thread.messages.find((item) => item.lineStart <= parsed.end && item.lineEnd >= parsed.start);
    if (message) return message;
  }
  return null;
}

function extractStructuredDeterministic(thread: ContextualThread): ReviewCandidate[] {
  const candidates: ReviewCandidate[] = [];
  for (const message of thread.messages) {
    if (isFoodRecommendationRequest(message.body) || isEventAdminBlock(message.body) || isRecipeOrIngredientContext(message.body)) {
      continue;
    }

    const request = nearestPriorRequest(thread, message);
    const anchor = request
      ? anchorFromRequest(
          thread,
          request,
          message.body.includes("\n") ? "curated_list" : "request_reply",
          "Candidate appears in a reply to an explicit food/place request",
        )
      : continuationAnchor(thread) ?? selfAnchorFromMessage(message);
    const lines = message.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      for (const input of parseStructuredLine(line, message, thread, anchor)) {
        const candidate = buildStructuredCandidate(input, thread);
        if (candidate) candidates.push(candidate);
      }
    }

    const self = parseSingleSentenceRecommendation(message, thread, request);
    if (self) {
      const candidate = buildStructuredCandidate(self, thread);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates;
}

function buildStructuredCandidate(input: StructuredCandidateInput, thread: ContextualThread) {
  const restaurant = normalizeDeterministicRestaurantName(input.restaurant);
  if (isBadRestaurantName(restaurant)) return null;
  const rawRefLabel = lineLabel(input.message);
  const anchor =
    input.anchor ??
    resolveCandidateAnchor(
      {
        restaurant,
        snippet: input.snippet ?? input.message.body,
        note: input.note ?? null,
        googleMapsUrl: null,
        sourceName: firstName(input.message.sender),
        rawRefLabel,
      },
      thread,
      input.message,
    );
  if (!anchor) return null;
  return buildReviewCandidate({
    restaurant,
    city: input.city ?? thread.cityContext ?? thread.continuedRequest?.cityContext ?? "Unsorted",
    area: input.area ?? inferArea(input.message.body),
    dishes: input.dishes ?? inferDishesFromText(`${input.restaurant} ${input.note ?? ""} ${input.snippet ?? ""}`),
    tags: input.tags ?? inferTagsFromText(`${input.restaurant} ${input.note ?? ""} ${input.snippet ?? ""}`),
    note: input.note ?? null,
    snippet: input.snippet ?? input.message.body,
    sourceName: firstName(input.message.sender),
    confidence: input.confidence ?? 0.8,
    sourceDate: input.message.timestamp.toISOString(),
    rawRefLabel,
    threadId: thread.id,
    method: "deterministic",
    anchor,
  });
}

function parseStructuredLine(
  line: string,
  message: WhatsAppMessage,
  thread: ContextualThread,
  anchor: CandidateAnchor | null,
): StructuredCandidateInput[] {
  line = stripExtractionControls(line);
  const clean = line.replace(/^\s*(?:[-*•⁠]|\d+\.)\s*/, "").trim();
  if (!clean || clean === "---" || isEventAdminBlock(clean) || antiRecommendationPattern.test(clean)) return [];

  const dishFromPlace = clean.match(/^(?<dish>[a-z][\p{L}\p{N}'& .-]{2,}?)\s+from\s+(?<restaurant>[a-z][\p{L}\p{N}'& .-]{2,})$/iu);
  if (dishFromPlace?.groups && anchor && isPlausibleDishFromPlace(dishFromPlace.groups.dish, dishFromPlace.groups.restaurant)) {
    return [
      {
        restaurant: dishFromPlace.groups.restaurant,
        message,
        city: thread.cityContext ?? thread.continuedRequest?.cityContext,
        dishes: [normalizeDishName(dishFromPlace.groups.dish)],
        snippet: clean,
        anchor,
        confidence: 0.8,
      },
    ];
  }

  const addingToList = clean.match(/^adding\s+to\s+.+?\s+list\s*-\s*(?<restaurant>[A-Z][\p{L}\p{N}'& .-]{2,})$/iu);
  if (addingToList?.groups && anchor) {
    return [
      {
        restaurant: addingToList.groups.restaurant,
        message,
        city: thread.cityContext,
        snippet: clean,
        anchor,
        confidence: 0.78,
      },
    ];
  }

  const topicPlaces = clean.match(/(?:^|-\s*)(?<dish>laal\s+maas|lal\s+maas|nihari|kachoris?|sushi)\s+places?\s*-\s*(?<places>.+)$/iu);
  if (topicPlaces?.groups && anchor) {
    return splitPlaceList(topicPlaces.groups.places).map((restaurant) => ({
      restaurant,
      message,
      city: thread.cityContext ?? thread.continuedRequest?.cityContext,
      dishes: [normalizeDishName(topicPlaces.groups!.dish)],
      snippet: clean,
      anchor,
      confidence: 0.78,
    }));
  }

  const explicitThereIs = clean.match(
    /^(?:there['’]?s|there is)\s+(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)\s+(?:which|that|and|is|has)\b(?<note>.*)$/iu,
  );
  if (explicitThereIs?.groups && anchor) {
    return buildAnchoredInputs([explicitThereIs.groups.restaurant], message, thread, anchor, {
      city: thread.cityContext ?? thread.continuedRequest?.cityContext,
      tags: cleanList([...contextualTagsFromAnchor(anchor), ...inferTagsFromText(`${anchor.anchorText} ${clean}`)]),
      dishes: inferDishesFromText(`${anchor.anchorText} ${clean}`),
      note: sentence(`${explicitThereIs.groups.note ?? ""}`.trim() || clean),
      snippet: clean,
      confidence: 0.84,
    });
  }

  const cuisineTags = cuisineTagsFromAnchor(anchor);
  if (anchor && cuisineTags.length) {
    const cuisineListEntry = parseCuisineListEntry(clean, line, message, thread, anchor, cuisineTags);
    if (cuisineListEntry.length) return cuisineListEntry;

    const naturalCuisineReply = parseNaturalCuisineReply(clean, message, thread, anchor, cuisineTags);
    if (naturalCuisineReply.length) return naturalCuisineReply;
  }

  if (anchor && /\bbest cafes?\b/i.test(clean) && /\s&\s/i.test(clean)) {
    const [rawNamesPart, ...noteParts] = clean.split(",");
    const namesPart = rawNamesPart?.replace(/^[^A-Za-z0-9]+/u, "") ?? "";
    const note = noteParts.join(",").trim() || clean;
    return namesPart
      .split(/\s*&\s*/i)
      .map((restaurant) => ({
        restaurant,
        message,
        city: thread.cityContext,
        note,
        snippet: clean,
        tags: ["cafe"],
        anchor,
        confidence: 0.8,
      }));
  }

  const selfHyphenPlace = clean.match(/^(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)\s*-\s*(?<note>.+)$/iu);
  if (selfHyphenPlace?.groups && anchor?.anchorType === "self_initiated" && !isCategoryHeading(selfHyphenPlace.groups.restaurant)) {
    const inputs = buildAnchoredInputs([selfHyphenPlace.groups.restaurant], message, thread, anchor, {
      city: thread.cityContext ?? thread.continuedRequest?.cityContext,
      tags: cleanList([...contextualTagsFromAnchor(anchor), ...inferTagsFromText(clean)]),
      dishes: inferDishesFromText(clean),
      note: sentence(selfHyphenPlace.groups.note),
      snippet: clean,
      confidence: anchor.anchorType === "self_initiated" ? 0.82 : 0.78,
    });
    if (inputs.length) return inputs;
  }

  if (anchor) {
    const anchoredReply = parseAnchoredGeneralReply(clean, message, thread, anchor);
    if (anchoredReply.length) return anchoredReply;
  }

  const rightSidePlace = clean.match(/^(?<locationHint>the one in [^-]+|[^-]{2,}?\bin\s+[^-]+)\s*-\s*(?<restaurant>[A-Z][\p{L}\p{N}'& .-]{2,}?)(?:\s+(?<note>is .+|also .+))?$/iu);
  if (rightSidePlace?.groups && anchor) {
    const area = rightSidePlace.groups.locationHint.match(/\bin\s+(?<area>.+)$/i)?.groups?.area;
    return [
      {
        restaurant: rightSidePlace.groups.restaurant,
        message,
        city: thread.cityContext ?? thread.continuedRequest?.cityContext,
        area: area ? titleCase(area) : null,
        dishes: inferDishesFromText(`${clean} ${threadText(thread.messages)}`),
        tags: inferTagsFromText(clean),
        note: rightSidePlace.groups.note ? sentence(rightSidePlace.groups.note) : null,
        snippet: clean,
        anchor,
        confidence: 0.82,
      },
    ];
  }

  const bracket = clean.match(/^\[(?<head>[^\]]+)\]\s*(?<tail>.+)$/u);
  if (bracket?.groups) return parseBracketedItineraryLine(bracket.groups.head, bracket.groups.tail, message, thread, anchor);

  if (anchor && /\bbest cafes?\b/i.test(clean) && /\s&\s/i.test(clean)) {
    const [rawNamesPart, ...noteParts] = clean.split(",");
    const namesPart = rawNamesPart?.replace(/^[^A-Za-z0-9]+/u, "") ?? "";
    const note = noteParts.join(",").trim() || clean;
    return namesPart
      .split(/\s*&\s*/i)
      .map((restaurant) => ({
        restaurant,
        message,
        city: thread.cityContext,
        note,
        snippet: clean,
        tags: ["cafe"],
        anchor,
        confidence: 0.8,
      }));
  }

  return [];
}

function parseAnchoredGeneralReply(
  clean: string,
  message: WhatsAppMessage,
  thread: ContextualThread,
  anchor: CandidateAnchor,
): StructuredCandidateInput[] {
  if (isQuestionOnlyCandidate(clean, clean) || antiRecommendationPattern.test(clean) || isLinkOnlyReply(clean)) return [];
  if (/^\[[^\]]+\]/u.test(clean)) return [];
  if (/^the one in\b/i.test(clean)) return [];

  const contextTags = contextualTagsFromAnchor(anchor);
  const city = thread.cityContext ?? thread.continuedRequest?.cityContext;
  const contextText = `${anchor.anchorText} ${clean}`;

  const forCuisinePlace = clean.match(
    /^For\s+(?<topic>[^,]{2,}),\s+(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)(?:\s+(?:on|in|at)\s+(?<area>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?))?\s+(?:is|was)\s+(?<note>.+)$/iu,
  );
  if (forCuisinePlace?.groups) {
    return buildAnchoredInputs([forCuisinePlace.groups.restaurant], message, thread, anchor, {
      city,
      area: forCuisinePlace.groups.area ? titleCase(cleanAreaHint(forCuisinePlace.groups.area)) : null,
      tags: cleanList([...contextTags, ...inferTagsFromText(`${forCuisinePlace.groups.topic} ${clean}`)]),
      dishes: inferDishesFromText(`${forCuisinePlace.groups.topic} ${clean}`),
      note: sentence(forCuisinePlace.groups.note),
      snippet: clean,
      confidence: 0.82,
    });
  }

  const calledPlace = clean.match(
    /\bcalled\s+["']?(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)["']?(?:\s+in\s+(?<area>[A-Z][\p{L}\p{N}'& .-]{2,}?))?(?:[.!?]|$)/iu,
  );
  if (calledPlace?.groups) {
    return buildAnchoredInputs([calledPlace.groups.restaurant], message, thread, anchor, {
      city,
      area: calledPlace.groups.area ? titleCase(cleanAreaHint(calledPlace.groups.area)) : null,
      tags: cleanList([...contextTags, ...inferTagsFromText(`${contextText} ${threadText(thread.messages)}`)]),
      dishes: inferDishesFromText(`${contextText} ${threadText(thread.messages)}`),
      note: sentence(clean),
      snippet: clean,
      confidence: 0.84,
    });
  }

  const replacement = clean.match(
    /\breplacing\s+(?<old>[^()]+?)(?:\s*\([^)]*\))?\s+with\s+(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)(?:\s+in\s+(?<area>[A-Z][\p{L}\p{N}'& .-]{2,}?))?(?:\s+for\s+(?<note>.+))?$/iu,
  );
  if (replacement?.groups) {
    return buildAnchoredInputs([replacement.groups.restaurant], message, thread, anchor, {
      city,
      area: replacement.groups.area ? titleCase(cleanAreaHint(replacement.groups.area)) : null,
      tags: cleanList([...contextTags, ...inferTagsFromText(replacement.groups.note ?? clean)]),
      note: replacement.groups.note ? sentence(`for ${replacement.groups.note}`) : sentence(clean),
      snippet: clean,
      confidence: 0.84,
    });
  }

  const recommendationWouldBe = clean.match(
    /\brecommendation\s+for\s+(?<topic>[\p{L}\p{N} -]+?)\s+would\s+be\s+(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)(?:\s+at\s+(?<area>[A-Z][\p{L}\p{N}'& .-]{2,}?))?(?:\s*\(|\.|$)/iu,
  );
  if (recommendationWouldBe?.groups) {
    return buildAnchoredInputs([recommendationWouldBe.groups.restaurant], message, thread, anchor, {
      city,
      area: recommendationWouldBe.groups.area ? titleCase(cleanAreaHint(recommendationWouldBe.groups.area)) : null,
      tags: cleanList([...contextTags, ...inferTagsFromText(recommendationWouldBe.groups.topic)]),
      dishes: inferDishesFromText(recommendationWouldBe.groups.topic),
      note: sentence(clean),
      snippet: clean,
      confidence: 0.85,
    });
  }

  const topicAtPlaces = clean.match(
    /^(?<topic>(?:for\s+)?[\p{L}\p{N} &'/-]{3,}?(?:food|biryani|chinese|cake|desserts?|pastry|lunch|dinner|italian|indian|sushi|sea ?food|snacks?|rolls?))\s*(?:-|at|in)\s+(?<places>.+)$/iu,
  );
  if (topicAtPlaces?.groups && !/^there'?s\b/i.test(clean)) {
    const topicInputs = buildAnchoredInputs(splitAnchoredPlaceList(topicAtPlaces.groups.places), message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(topicAtPlaces.groups.topic)]),
      dishes: inferDishesFromText(topicAtPlaces.groups.topic),
      note: sentence(clean),
      snippet: clean,
      confidence: 0.8,
    });
    if (topicInputs.length) return topicInputs;
  }

  const categoryDashPlace = clean.match(
    /^(?<topic>Italian|Indian|Chinese|Bengali|Calcutta Biryani|Sea ?food|Cake cake|For cake cake)\s*-\s*(?<places>.+)$/iu,
  );
  if (categoryDashPlace?.groups) {
    const inputs = buildAnchoredInputs(splitAnchoredPlaceList(categoryDashPlace.groups.places), message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(categoryDashPlace.groups.topic)]),
      dishes: inferDishesFromText(categoryDashPlace.groups.topic),
      note: sentence(clean),
      snippet: clean,
      confidence: 0.8,
    });
    if (inputs.length) return inputs;
  }

  const tryForTheir = clean.match(
    /\btry\s+(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)\s+for\s+their\s+(?<note>[^.!?]+)(?<tail>[.!?][\s\S]*)?$/iu,
  );
  if (tryForTheir?.groups) {
    return buildAnchoredInputs([tryForTheir.groups.restaurant], message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(clean)]),
      dishes: inferDishesFromText(clean),
      note: sentence(`for their ${tryForTheir.groups.note}${tryForTheir.groups.tail ?? ""}`),
      snippet: clean,
      confidence: 0.82,
    });
  }

  const hyphenPlace = clean.match(/^(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)\s*-\s*(?<note>.+)$/iu);
  if (hyphenPlace?.groups && !isCategoryHeading(hyphenPlace.groups.restaurant)) {
    return buildAnchoredInputs([hyphenPlace.groups.restaurant], message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(clean)]),
      dishes: inferDishesFromText(clean),
      note: sentence(hyphenPlace.groups.note),
      snippet: clean,
      confidence: 0.8,
    });
  }

  const tryAt = clean.match(
    /\b(?:try|go to|please go to|can try|also try|would add)\b(?:\s+walk\s+in)?\s+(?:at\s+)?(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)(?:\s+for\s+(?<forNote>[^.!?]+)|\s*-\s*(?<dashNote>[^.!?]+))?(?:[.!?]|$)/iu,
  );
  if (tryAt?.groups && !/^(walk in|this place)$/i.test(tryAt.groups.restaurant.trim())) {
    const note = tryAt.groups.forNote ? `for ${tryAt.groups.forNote}` : tryAt.groups.dashNote;
    return buildAnchoredInputs([tryAt.groups.restaurant], message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(clean)]),
      dishes: inferDishesFromText(clean),
      note: note ? sentence(note) : sentence(clean),
      snippet: clean,
      confidence: 0.82,
    });
  }

  const thereIs = clean.match(
    /^(?:there'?s|there is)\s+(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)\s+(?:which|that|and|is|has)\b(?<note>.*)$/iu,
  );
  if (thereIs?.groups) {
    return buildAnchoredInputs([thereIs.groups.restaurant], message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(contextText)]),
      dishes: inferDishesFromText(contextText),
      note: sentence(`${thereIs.groups.note ?? ""}`.trim() || clean),
      snippet: clean,
      confidence: 0.84,
    });
  }

  const placeFor = clean.match(
    /^(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)\s+for\s+(?<note>[^.!?]+)(?:[.!?]|$)/iu,
  );
  if (placeFor?.groups && /\b(food|roll|dessert|cake|coffee|chai|sushi|biryani|sea ?food|vegetarian|korean|thai|japanese|chinese|italian|gujarati|bengali)\b/i.test(placeFor.groups.note)) {
    return buildAnchoredInputs([placeFor.groups.restaurant], message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(contextText)]),
      dishes: inferDishesFromText(contextText),
      note: sentence(`for ${placeFor.groups.note}`),
      snippet: clean,
      confidence: 0.8,
    });
  }

  const bestShop = clean.match(
    /^(?:also\s+)?(?<restaurant>[\p{L}0-9][\p{L}\p{N}'& .-]{2,}?)\s+is\s+the\s+best\s+(?<note>pastry shop|bakery|cafe|restaurant|food|sushi|cake)[\s\S]*$/iu,
  );
  if (bestShop?.groups) {
    return buildAnchoredInputs([bestShop.groups.restaurant], message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(contextText)]),
      dishes: inferDishesFromText(contextText),
      note: sentence(clean.replace(new RegExp(`^also\\s+${escapeRegExp(bestShop.groups.restaurant)}\\s+`, "i"), "")),
      snippet: clean,
      confidence: 0.8,
    });
  }

  const thinkLooks = clean.match(
    /^i\s+think\s+(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)(?:\s+by\s+[\p{L} ]+)?\s+looks\s+(?<note>promising|great|good|interesting)\b.*$/iu,
  );
  if (thinkLooks?.groups) {
    return buildAnchoredInputs([thinkLooks.groups.restaurant], message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(contextText)]),
      note: sentence(`looks ${thinkLooks.groups.note}`),
      snippet: clean,
      confidence: 0.78,
    });
  }

  const heardGreat = clean.match(
    /^(?:i['’]?ve heard\s+)?(?<restaurant>[\p{L}0-9][\p{L}\p{N}'& .-]{2,}?)\s+(?:in\s+(?<area>[A-Z][\p{L}\p{N}'& .-]{2,}?)\s+)?(?:is|was|looks|has been)\s+(?<note>great|incredible|promising|awesome|amazing|very good|my go\s*to\b.*)[.!?]*$/iu,
  );
  if (heardGreat?.groups && /\b(great|incredible|promising|awesome|good|best|go\s*to|favorite|favourite)\b/i.test(heardGreat.groups.note)) {
    return buildAnchoredInputs([heardGreat.groups.restaurant], message, thread, anchor, {
      city,
      area: heardGreat.groups.area ? titleCase(cleanAreaHint(heardGreat.groups.area)) : null,
      tags: cleanList([...contextTags, ...inferTagsFromText(contextText)]),
      dishes: inferDishesFromText(contextText),
      note: sentence(`${heardGreat.groups.note}`),
      snippet: clean,
      confidence: 0.82,
    });
  }

  const placeIfBeen = clean.match(/^(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?),\s+if\s+you\s+haven'?t\s+been\b(?<note>.*)$/iu);
  if (placeIfBeen?.groups) {
    return buildAnchoredInputs([placeIfBeen.groups.restaurant], message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(contextText)]),
      dishes: inferDishesFromText(contextText),
      note: sentence(`if you haven't been${placeIfBeen.groups.note ?? ""}`),
      snippet: clean,
      confidence: 0.82,
    });
  }

  const doesGoodDish = clean.match(
    /^(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)\s+does\s+good\s+(?<dish>sushi|desserts?|cake|coffee|food)\b(?<rest>.*)$/iu,
  );
  if (doesGoodDish?.groups) {
    return buildAnchoredInputs([doesGoodDish.groups.restaurant], message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(contextText)]),
      dishes: cleanList([...inferDishesFromText(contextText), normalizeDishName(doesGoodDish.groups.dish)]),
      note: sentence(`does good ${doesGoodDish.groups.dish}${doesGoodDish.groups.rest ?? ""}`),
      snippet: clean,
      confidence: 0.82,
    });
  }

  const recentlyRevamped = clean.match(
    /^(?:also\s+)?(?:i\s+believe\s+)?(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)\s+has\s+recently\s+revamped\b(?<note>.*)$/iu,
  );
  if (recentlyRevamped?.groups) {
    return buildAnchoredInputs([recentlyRevamped.groups.restaurant], message, thread, anchor, {
      city,
      tags: contextTags,
      dishes: inferDishesFromText(contextText),
      note: sentence(`has recently revamped${recentlyRevamped.groups.note ?? ""}`),
      snippet: clean,
      confidence: 0.8,
    });
  }

  const forever = clean.match(/^(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)\s+forever\.{0,3}$/iu);
  if (forever?.groups) {
    return buildAnchoredInputs([forever.groups.restaurant], message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(contextText)]),
      note: sentence(clean),
      snippet: clean,
      confidence: 0.78,
    });
  }

  const firstSentencePlace = clean.match(/^(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]*\b(?:cafe|bakery|bistro|kitchen|bar|dairy|rolls?))\b[.!]\s*(?<note>.*)$/iu);
  if (firstSentencePlace?.groups) {
    return buildAnchoredInputs([firstSentencePlace.groups.restaurant], message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(contextText)]),
      dishes: inferDishesFromText(contextText),
      note: firstSentencePlace.groups.note ? sentence(firstSentencePlace.groups.note) : null,
      snippet: clean,
      confidence: 0.78,
    });
  }

  const dashPlace = clean.match(/^(?:another\s+classic\s+with\s+[^-]+|[^-]{3,}?\bfood)\s*-\s*(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,})$/iu);
  if (dashPlace?.groups) {
    return buildAnchoredInputs([dashPlace.groups.restaurant], message, thread, anchor, {
      city,
      tags: cleanList([...contextTags, ...inferTagsFromText(contextText)]),
      note: sentence(clean),
      snippet: clean,
      confidence: 0.8,
    });
  }

  const addToList = clean.match(/^(?:would add|add|and|also)\s+(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)(?:\s+to the list)?[.!?]*$/iu);
  if (addToList?.groups) {
    return buildAnchoredInputs([addToList.groups.restaurant], message, thread, anchor, {
      city,
      tags: contextTags,
      snippet: clean,
      confidence: 0.76,
    });
  }

  const trailingFavorite = clean.match(
    /^(?:still\s+)?(?:my\s+)?(?:absolute\s+)?favou?rite,?\s+can(?:not|['’]?t)\s+recommend\s+enough!?\s+(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,})$/iu,
  );
  if (trailingFavorite?.groups) {
    return buildAnchoredInputs([trailingFavorite.groups.restaurant], message, thread, anchor, {
      city,
      tags: contextTags,
      note: sentence(clean),
      snippet: clean,
      confidence: 0.8,
    });
  }

  const favoriteList = clean.match(/^(?<places>[\p{L}\p{N}'&, .-]{6,}?)\s+are\s+some\s+of\s+my\s+favou?rites\b.*$/iu);
  if (favoriteList?.groups) {
    return buildAnchoredInputs(splitAnchoredPlaceList(favoriteList.groups.places), message, thread, anchor, {
      city,
      tags: contextTags,
      note: sentence(clean),
      snippet: clean,
      confidence: 0.8,
    });
  }

  const barePlaceInArea = clean.match(/^(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)\s+in\s+(?<area>South Mumbai|Lalbaug|Kammanahalli|Indiranagar|Koramangala|Bandra|BKC|Domlur|Ulsoor|Sadashivnagar|C Scheme|HSR|Kalighat)$/iu);
  if (barePlaceInArea?.groups) {
    return buildAnchoredInputs([barePlaceInArea.groups.restaurant], message, thread, anchor, {
      city,
      area: titleCase(barePlaceInArea.groups.area),
      tags: contextTags,
      snippet: clean,
      confidence: 0.76,
    });
  }

  if (isShortAnchoredPlaceReply(clean, anchor)) {
    return buildAnchoredInputs([clean], message, thread, anchor, {
      city,
      tags: contextTags,
      snippet: clean,
      confidence: 0.74,
    });
  }

  const commaList = parseAnchoredCommaList(clean, anchor);
  if (commaList.length) {
    return buildAnchoredInputs(commaList, message, thread, anchor, {
      city,
      tags: contextTags,
      snippet: clean,
      confidence: 0.76,
    });
  }

  return [];
}

function buildAnchoredInputs(
  rawRestaurants: string[],
  message: WhatsAppMessage,
  thread: ContextualThread,
  anchor: CandidateAnchor,
  defaults: Partial<StructuredCandidateInput>,
): StructuredCandidateInput[] {
  return cleanListPreserveCase(rawRestaurants.map(cleanAnchoredRestaurantName))
    .filter((restaurant) => isPlausibleAnchoredRestaurantName(restaurant))
    .map((restaurant) => ({
      restaurant,
      message,
      city: defaults.city ?? thread.cityContext ?? thread.continuedRequest?.cityContext,
      area: defaults.area ?? null,
      dishes: defaults.dishes ?? inferDishesFromText(`${restaurant} ${defaults.note ?? ""} ${defaults.snippet ?? ""}`),
      tags: defaults.tags ?? contextualTagsFromAnchor(anchor),
      note: defaults.note ?? null,
      snippet: defaults.snippet ?? message.body,
      confidence: defaults.confidence ?? 0.78,
      anchor,
    }));
}

function contextualTagsFromAnchor(anchor: CandidateAnchor | null) {
  if (!anchor) return [];
  return inferRequestTopics(anchor.anchorText).filter((topic) => !["lunch", "dinner", "breakfast", "buffet"].includes(topic));
}

function splitAnchoredPlaceList(value: string) {
  return value
    .replace(/\s+are\s+some\s+of\s+my\s+favou?rites\b.*$/i, "")
    .replace(/\s+doing\s+a\s+[^,]+/gi, "")
    .replace(/\s+by\s+[\p{L} ]+\s+looks\s+promising.*$/iu, "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/[.!?]+$/g, "")
    .split(/\s*(?:,|\/|\bor\b)\s*/i)
    .map(cleanAnchoredRestaurantName)
    .filter((piece) => piece && isPlausibleAnchoredRestaurantName(piece));
}

function parseAnchoredCommaList(clean: string, anchor: CandidateAnchor) {
  if (!clean.includes(",")) return [];
  if (/\b(try|all the dishes|ordered|absolutely|amazing|recommend enough|if you haven't been)\b/i.test(clean)) return [];
  if (!/\b(bakery|bakeries|cake|lunch|food|places?|recommend|reccos?|recos?|recs?|sushi|vegetarian|sea ?food)\b/i.test(anchor.anchorText)) {
    return [];
  }
  if (/\b(?:is|was|has|which|that)\b/i.test(clean) && !/\bare\s+some\s+of\s+my\s+favou?rites\b/i.test(clean)) return [];
  return splitAnchoredPlaceList(clean);
}

function isShortAnchoredPlaceReply(clean: string, anchor: CandidateAnchor) {
  const stripped = clean.replace(/[.!?]+$/g, "").trim();
  if (stripped.includes(",") || stripped.split(/\s+/).length > 4) return false;
  if (
    !inferRequestTopics(anchor.anchorText).length &&
    !/\b(?:awesome|good|great)\s+food\b/i.test(anchor.anchorText) &&
    !/\b(food|eat|restaurant|cafe|bakery|places?|spots?).{0,80}\b(recommendations?|reccos?|recos?|recs?)\b/i.test(anchor.anchorText) &&
    !/\b(recommendations?|reccos?|recos?|recs?).{0,80}\b(eat|places?|food|cafe|restaurant)\b/i.test(anchor.anchorText)
  ) {
    return false;
  }
  return isPlausibleAnchoredRestaurantName(stripped);
}

function cleanAnchoredRestaurantName(value: string) {
  return value
    .replace(/[\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069]/g, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\s*(?:and|also|can try|try|would add|add|for\s+[\p{L}\p{N} ]+\s*-\s*)\s+/iu, "")
    .replace(/\s+doing\s+a\s+.+$/i, "")
    .replace(/\s+by\s+[\p{L} ]+\s+looks\s+promising.*$/iu, "")
    .replace(/\s+(?:is|was|looks|has been)\s+(?:great|incredible|promising|awesome|amazing|very good|my go\s*to\b.*).*$/i, "")
    .replace(/\s+forever\.{0,3}$/i, "")
    .replace(/\s+to the list$/i, "")
    .replace(/\s+too$/i, "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/[.!?,]+$/g, "")
    .trim();
}

function cleanAreaHint(value: string) {
  return value.replace(/\s*\([^)]*\).*$/g, "").replace(/\bor any other branch\b.*$/i, "").replace(/[.!?,]+$/g, "").trim();
}

function isPlausibleAnchoredRestaurantName(value: string) {
  const cleaned = cleanAnchoredRestaurantName(value);
  if (isBadRestaurantName(cleaned)) return false;
  if (/^(walk in|higher chances|phoenix mall|the mall|this mall|same area|in the area|any cuisine|old restaurant)$/i.test(cleaned)) return false;
  if (/\b(recommendations?|recos?|reccos?|suggestions?|must try recipes?|higher chances|getting in|in town|in the area)\b/i.test(cleaned)) return false;
  return /^[\p{L}0-9][\p{L}\p{N}'& .-]{2,}$/u.test(cleaned);
}

function isLinkOnlyReply(clean: string) {
  return /^https?:\/\/\S+(?:\s+[\p{L}\p{N} :)]+)?$/iu.test(clean.trim());
}

function parseCuisineListEntry(
  clean: string,
  rawLine: string,
  message: WhatsAppMessage,
  thread: ContextualThread,
  anchor: CandidateAnchor,
  cuisineTags: string[],
): StructuredCandidateInput[] {
  if (!/^\s*(?:[-*â€¢â ]|\d+\.)\s*/u.test(rawLine)) return [];
  const listEntry = clean.match(/^(?<restaurant>[\p{L}\p{N}'& .-]{3,})(?:\s*\((?<note>[^)]+)\))?$/iu);
  if (!listEntry?.groups) return [];
  const restaurant = titleCase(listEntry.groups.restaurant.trim());
  if (!isPlausibleCuisineRestaurantName(restaurant)) return [];
  const note = listEntry.groups.note ? sentence(listEntry.groups.note) : null;
  return [
    {
      restaurant,
      message,
      city: thread.cityContext ?? thread.continuedRequest?.cityContext,
      dishes: inferDishesFromText(`${clean} ${note ?? ""}`),
      tags: cuisineTags,
      note,
      snippet: clean,
      anchor,
      confidence: 0.78,
    },
  ];
}

function parseNaturalCuisineReply(
  clean: string,
  message: WhatsAppMessage,
  thread: ContextualThread,
  anchor: CandidateAnchor,
  cuisineTags: string[],
): StructuredCandidateInput[] {
  if (isQuestionOnlyCandidate(clean, clean) || antiRecommendationPattern.test(clean)) return [];

  const inArea = clean.match(
    /^(?<restaurant>[A-Z][\p{L}\p{N}'& .-]{2,}?)\s+in\s+(?<area>[A-Z][\p{L}\p{N}'& .-]{2,}?)\s+is(?:\s*,?\s*too|\s+(?<note>.+))?\.?$/iu,
  );
  if (inArea?.groups) {
    const restaurant = titleCase(inArea.groups.restaurant.trim());
    const area = titleCase(inArea.groups.area.trim());
    const note = inArea.groups.note ? sentence(inArea.groups.note) : sentence(clean);
    if (!isPlausibleCuisineRestaurantName(restaurant) || isWeakNegativeEvidence(note)) return [];
    return [
      {
        restaurant,
        message,
        city: thread.cityContext ?? thread.continuedRequest?.cityContext,
        area,
        dishes: inferDishesFromText(clean),
        tags: cuisineTags,
        note,
        snippet: clean,
        anchor,
        confidence: 0.82,
      },
    ];
  }

  const goTo = clean.match(/^(?<restaurant>[A-Z][\p{L}\p{N}'& .-]{2,}?)\s+has been my go\s*to\b(?<note>.*)$/iu);
  if (goTo?.groups) {
    const restaurant = titleCase(goTo.groups.restaurant.trim());
    const note = sentence(`has been my go to${goTo.groups.note ?? ""}`);
    if (!isPlausibleCuisineRestaurantName(restaurant) || isWeakNegativeEvidence(note)) return [];
    return [
      {
        restaurant,
        message,
        city: thread.cityContext ?? thread.continuedRequest?.cityContext,
        dishes: inferDishesFromText(clean),
        tags: cuisineTags,
        note,
        snippet: clean,
        anchor,
        confidence: 0.82,
      },
    ];
  }

  return [];
}

function parseBracketedItineraryLine(
  rawHead: string,
  rawTail: string,
  message: WhatsAppMessage,
  thread: ContextualThread,
  anchor: CandidateAnchor | null,
): StructuredCandidateInput[] {
  if (!anchor) return [];
  const head = rawHead.trim();
  const tail = rawTail.trim();
  if (/\b(shopping|market|bazaar|fort|palace|touristy|itinerary)\b/i.test(head) && !/\b(cafe|bar|restaurant|food|snacks?|kachori|chai)\b/i.test(`${head} ${tail}`)) {
    return [];
  }

  const headPlace = head.match(/^(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]+?)(?:,\s*in\s+(?<area>[^,]+))?$/u);
  const headIsTopic = /\b(nihari|maas|chai|kachoris?|snacks?|good|best|shopping|bar vibes?)\b/i.test(head);
  if (headPlace?.groups && (!headIsTopic || headPlace.groups.area) && /\b(must visit|dal pakwan|best|restaurant|cafe|bar|food|chai|kachori|snacks?|vibe|speakeasy|cocktails?)\b/i.test(tail)) {
    return [
      {
        restaurant: headPlace.groups.restaurant,
        message,
        city: thread.cityContext,
        area: headPlace.groups.area ? titleCase(headPlace.groups.area) : null,
        dishes: inferDishesFromText(`${head} ${tail}`),
        tags: inferTagsFromText(`${head} ${tail}`),
        note: sentence(tail),
        snippet: `[${head}] ${tail}`,
        anchor,
        confidence: 0.82,
      },
    ];
  }

  const paren = tail.match(/^(?<restaurant>[^()]+?)\s*\((?<note>[^)]+)\)(?<rest>.*)$/u);
  if (paren?.groups) {
    const note = sentence(`${paren.groups.note} ${paren.groups.rest ?? ""}`);
    return [
      {
        restaurant: paren.groups.restaurant,
        message,
        city: thread.cityContext,
        dishes: inferDishesFromText(`${head} ${note}`),
        tags: inferTagsFromText(`${head} ${note}`),
        note,
        snippet: `[${head}] ${tail}`,
        anchor,
        confidence: 0.84,
      },
    ];
  }

  const pieces = tail.split(/\s*,\s*/).map((piece) => piece.trim()).filter(Boolean);
  const restaurants = pieces.filter((piece) => isPlausibleListRestaurant(piece));
  return restaurants.map((restaurant) => ({
    restaurant,
    message,
    city: thread.cityContext,
    dishes: inferDishesFromText(`${head} ${tail}`),
    tags: inferTagsFromText(`${head} ${tail}`),
    note: sentence(`${head} ${tail}`),
    snippet: `[${head}] ${tail}`,
    anchor,
    confidence: 0.78,
  }));
}

function parseSingleSentenceRecommendation(
  message: WhatsAppMessage,
  thread: ContextualThread,
  request: WhatsAppMessage | null,
): StructuredCandidateInput | null {
  const body = message.body.replace(/\s+/g, " ").trim();
  const tryAt = body.match(/^Try\s+(?<restaurant>.+?)\s+at\s+(?<area>[^.?!]+)[.?!]\s*(?<note>.*)$/u)
    ?? body.match(/\btry\s+(?<restaurant>[A-Z][\p{L}\p{N}'& -]{2,}?)(?:[.!]|$)\s*(?<note>.*)$/u);
  if (tryAt?.groups && !/\bthere\b/i.test(tryAt.groups.restaurant)) {
    const anchor = request
      ? anchorFromRequest(thread, request, "request_reply", "Candidate follows an explicit food/place request in the same mini-thread")
      : null;
    return {
      restaurant: tryAt.groups.restaurant,
      message,
      city: thread.cityContext,
      area: tryAt.groups.area ? titleCase(tryAt.groups.area) : null,
      dishes: inferDishesFromText(body),
      tags: inferTagsFromText(body),
      note: sentence(`${tryAt.groups.note ?? ""}`) || sentence(body),
      snippet: body,
      anchor,
      confidence: request ? 0.84 : 0.8,
    };
  }
  return null;
}

function extractDeterministic(thread: ContextualThread): ReviewCandidate[] {
  const structured = extractStructuredDeterministic(thread);
  return dedupeReviewCandidates(structured);
}

function buildReviewCandidate(input: {
  restaurant: string;
  city: string;
  area?: string | null;
  address?: string | null;
  dishes?: string[];
  tags?: string[];
  note?: string | null;
  snippet?: string | null;
  sourceName?: string | null;
  confidence: number;
  sourceDate: string;
  rawRefLabel: string;
  sourceHash?: string;
  threadId: string;
  method: "ollama" | "deterministic";
  anchor: CandidateAnchor;
}): ReviewCandidate {
  const nameParts = normalizeRestaurantNameAndArea(input.restaurant);
  const restaurant = normalizeDisplayRestaurantName(titleCase(nameParts.restaurant));
  const city = normalizeCity(input.city) ?? "Unsorted";
  const restaurantSlug = slugify(restaurant);
  const citySlug = slugify(city);
  const snippet = truncate(input.snippet ?? "", 180);
  const inputNote = input.note?.trim();
  const inlineDescriptor = extractInlineDescriptor(snippet);
  const rawNote =
    inputNote &&
    normalizeLoose(inputNote) !== normalizeLoose(snippet) &&
    !isWeakDescriptor(inputNote, restaurant, snippet)
      ? inputNote
      : inlineDescriptor ?? inputNote;
  const noteQuality = normalizeNoteQuality(cleanDescriptorNote(rawNote ?? snippet), restaurant, snippet);
  const sourceHash =
    input.sourceHash ?? stableHash([restaurantSlug, citySlug, input.sourceName, snippet, input.sourceDate]);

  return {
    restaurant,
    restaurantSlug,
    city,
    citySlug,
    area: normalizeAreaDisplay(input.area ?? nameParts.area ?? null),
    address: input.address ?? null,
    dishes: cleanList(input.dishes ?? []),
    tags: cleanList(input.tags ?? []),
    note: noteQuality.note,
    snippet,
    sourceName: input.sourceName ?? null,
    confidence: input.confidence,
    confidenceBand: confidenceBand(input.confidence),
    sourceHash,
    sourceType: "whatsapp_zip",
    sourceDate: input.sourceDate,
    rawRefLabel: input.rawRefLabel,
    createdBy: "contextual-importer",
    threadId: input.threadId,
    extractionMethod: input.method,
    evidenceLines: input.rawRefLabel,
    candidateLines: input.rawRefLabel,
    needsDescriptor: noteQuality.needsDescriptor,
    descriptorReason: noteQuality.descriptorReason,
    descriptorSource: noteQuality.descriptorSource,
    requestId: input.anchor.requestId ?? null,
    requestStatus: input.anchor.requestId ? "unresolved" : null,
    supportingLines: [],
    contextSource: input.anchor.contextSource ?? "same_thread",
    contextLines: input.anchor.contextLines ?? input.anchor.anchorLines ?? null,
    displayNote: null,
    recommendationContext: null,
    contextEvidenceLines: [],
    ...input.anchor,
  };
}

function dedupeReviewCandidates(candidates: ReviewCandidate[]) {
  const merged = new Map<string, ReviewCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.restaurantSlug}:${candidate.citySlug}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, candidate);
      continue;
    }
    existing.dishes = cleanList([...(existing.dishes ?? []), ...(candidate.dishes ?? [])]);
    existing.tags = cleanList([...(existing.tags ?? []), ...(candidate.tags ?? [])]);
    existing.supportingLines = cleanListPreserveCase([...(existing.supportingLines ?? []), ...(candidate.supportingLines ?? [])]);
    existing.area = existing.area ?? candidate.area;
    existing.address = existing.address ?? candidate.address;
    existing.note = existing.note ?? candidate.note;
    if ((candidate.snippet ?? "").length > (existing.snippet ?? "").length) existing.snippet = candidate.snippet;
    if ((candidate.confidence ?? 0) > (existing.confidence ?? 0)) {
      existing.confidence = candidate.confidence;
      existing.confidenceBand = candidate.confidenceBand;
      existing.anchorType = candidate.anchorType;
      existing.anchorConfidence = candidate.anchorConfidence;
      existing.anchorReason = candidate.anchorReason;
      existing.anchorText = candidate.anchorText;
      existing.anchorSender = candidate.anchorSender;
      existing.anchorLines = candidate.anchorLines;
      existing.candidateLines = candidate.candidateLines;
      existing.requestId = candidate.requestId;
      existing.requestStatus = candidate.requestStatus;
      existing.contextSource = candidate.contextSource;
      existing.contextLines = candidate.contextLines;
    }
  }
  return [...merged.values()].sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0));
}

function attachSupportingNotes(candidates: ReviewCandidate[], threads: ContextualThread[]) {
  for (const thread of threads) {
    const threadCandidates = candidates
      .filter((candidate) => candidate.threadId === thread.id)
      .sort((left, right) => (parseLineRef(left.candidateLines)?.start ?? 0) - (parseLineRef(right.candidateLines)?.start ?? 0));
    if (!threadCandidates.length) continue;

    for (const message of thread.messages) {
      if (!isSupportingNote(message.body)) continue;
      if (threadCandidates.some((candidate) => {
        const candidateLine = parseLineRef(candidate.candidateLines);
        return candidateLine?.start === message.lineStart;
      })) {
        continue;
      }
      const previous = [...threadCandidates]
        .filter((candidate) => (parseLineRef(candidate.candidateLines)?.start ?? 0) < message.lineStart)
        .sort((left, right) => (parseLineRef(right.candidateLines)?.start ?? 0) - (parseLineRef(left.candidateLines)?.start ?? 0))[0];
      if (!previous) continue;
      if (hasInterveningQuestion(thread, previous, message)) continue;
      const line = lineLabel(message);
      previous.supportingLines = cleanListPreserveCase([...(previous.supportingLines ?? []), line]);
      previous.dishes = cleanList([...(previous.dishes ?? []), ...inferDishesFromText(message.body)]);
      const note = sentence(message.body);
      if (hasCommunityDescriptor(note)) {
        previous.note = previous.note ? sentence(`${previous.note} ${note}`) : note;
        previous.needsDescriptor = false;
        previous.descriptorReason = null;
        previous.descriptorSource = "community_note";
      }
      if ((previous.snippet ?? "").length < 160) previous.snippet = sentence(`${previous.snippet ?? ""} ${note}`);
    }
  }
  return candidates;
}

function hasInterveningQuestion(thread: ContextualThread, candidate: ReviewCandidate, supportMessage: WhatsAppMessage) {
  const candidateLine = parseLineRef(candidate.candidateLines);
  if (!candidateLine) return false;
  return thread.messages.some(
    (message) =>
      message.lineStart > candidateLine.end &&
      message.lineStart < supportMessage.lineStart &&
      (isFoodRecommendationRequest(message.body) || isQuestionOnlyCandidate(message.body, message.body)),
  );
}

function finalizeDisplayMetadata(candidates: ReviewCandidate[]) {
  for (const candidate of candidates) {
    const recommendationContext = deriveRecommendationContext(candidate);
    candidate.recommendationContext = recommendationContext;
    candidate.contextEvidenceLines = cleanListPreserveCase([
      candidate.anchorLines,
      candidate.contextLines ?? "",
      ...(candidate.supportingLines ?? []),
    ]);
    candidate.displayNote = buildDisplayNote(candidate, recommendationContext);
  }
  return candidates;
}

function buildDisplayNote(candidate: ReviewCandidate, recommendationContext: string | null) {
  const rawNote = sentence(candidate.note ?? "");
  if (!rawNote) {
    return recommendationContext ? `Recommended for ${recommendationContext}.` : null;
  }
  if (recommendationContext && isBareSentiment(rawNote)) {
    return sentence(`${stripBareSentimentLead(rawNote)} for ${recommendationContext}`);
  }
  if (recommendationContext) {
    return sentence(`Recommended as ${recommendationContext}. ${rawNote}`);
  }
  return rawNote;
}

function deriveRecommendationContext(candidate: ReviewCandidate) {
  const anchorContext = deriveContextFromText(candidate.anchorText);
  if (anchorContext) return anchorContext;
  const dishContext = cleanList(candidate.dishes ?? []).join(", ");
  return dishContext || null;
}

function deriveContextFromText(text: string) {
  const lower = text.toLowerCase();
  const area = text.match(/\baround\s+(?<area>[\p{L}\p{N}'& .-]{2,})(?:[?.!,]|$)/iu)?.groups?.area
    ?? text.match(/\bin\s*&\s*around\s+(?<area>[\p{L}\p{N}'& .-]{2,})(?:[?.!,]|$)/iu)?.groups?.area;
  const normalizedArea = area ? titleCase(area.trim()) : null;
  const pieces: string[] = [];
  const cuisine = inferCuisineTags(text)[0];

  if (cuisine) pieces.push(`${titleCase(cuisine)} food`);
  else if (/\bsushi\b/i.test(text)) pieces.push("sushi");
  else if (/\bbakery\b/i.test(text) && /\bcake\b/i.test(text)) pieces.push("bakery/cake");
  else if (/\bdinner\b/i.test(text)) pieces.push("dinner place");
  else if (/\bbreakfast\b/i.test(text)) pieces.push("breakfast");
  else if (/\bchai|coffee\b/i.test(text)) pieces.push("chai/coffee");

  if (!pieces.length) return null;
  if (/\balcohol|wine\b/i.test(text) && !pieces.some((piece) => /alcohol|wine/i.test(piece))) {
    pieces.push("with alcohol/wine");
  }
  const base = pieces.join(" ");
  if (normalizedArea && /\bsushi\b/i.test(text)) return `${base} around ${normalizedArea}`;
  if (normalizedArea && !/\bprice no bar\b/i.test(lower)) return `${base} around ${normalizedArea}`;
  return base;
}

function isBareSentiment(note: string) {
  return /^(?:it\s+)?(?:is\s+)?(?:also\s+)?(?:very\s+)?(?:really\s+)?(?:good|great|awesome|nice|worth it),?\.?$/i.test(note.trim());
}

function stripBareSentimentLead(note: string) {
  const stripped = note.replace(/^(?:it\s+)?(?:is\s+)?(?:also\s+)?/i, "").replace(/[,.]+$/g, "").trim().toLowerCase();
  return stripped ? `${stripped[0]!.toUpperCase()}${stripped.slice(1)}` : stripped;
}

function interpretAndPromoteCandidates(candidates: ReviewCandidate[], threads: ContextualThread[]) {
  const threadMap = new Map(threads.map((thread) => [thread.id, thread]));
  const promoted: ReviewCandidate[] = [];
  const parked: ReviewCandidate[] = [];
  const debugEvidence: DebugEvidenceCandidate[] = [];
  const rejected: RejectedExtraction[] = [];

  for (const candidate of candidates) {
    const thread = threadMap.get(candidate.threadId);
    if (!thread) {
      const parkedCandidate = {
        ...candidate,
        reviewStatus: "parked" as const,
        promotionReason: "Missing source thread for semantic promotion",
      };
      parked.push(parkedCandidate);
      continue;
    }

    const frame = buildThreadFrame(thread);
    const semantic = interpretCandidateMention(candidate, frame);
    const normalized = normalizeRestaurantSpan({
      restaurantSpan: semantic.mentions[0]?.restaurantSpan ?? candidate.restaurant,
      fullMessageText: candidate.snippet ?? "",
      sentimentSpan: semantic.mentions[0]?.sentimentSpan ?? candidate.note ?? null,
      areaSpan: semantic.mentions[0]?.areaSpan ?? candidate.area ?? null,
      requestFrame: frame.activeRequest ?? frame.continuationOf,
      candidate,
    });
    const decision = promoteMention(candidate, normalized, semantic, frame, thread);
    debugEvidence.push(decision.evidence);

    if (decision.decision === "promote" && decision.candidate) {
      promoted.push(decision.candidate);
    } else if (decision.decision === "park" && decision.candidate) {
      parked.push(decision.candidate);
    } else if (decision.rejected) {
      rejected.push(decision.rejected);
    }
  }

  return {
    promoted: dedupeReviewCandidates(promoted).map((candidate) => ({ ...candidate, reviewStatus: "final" as const })),
    parked: dedupeReviewCandidates(parked).map((candidate) => ({ ...candidate, reviewStatus: "parked" as const })),
    debugEvidence,
    rejected,
  };
}

function buildThreadFrame(thread: ContextualThread): ThreadFrame {
  const requests = buildThreadRequests(thread);
  const active = requests.find((request) => request.requestKind === "restaurant_place" && request.status !== "rejected") ?? null;
  const activeRequest = active ? requestFrameFromExtraction(active) : null;
  const continuationOf = thread.continuedRequest
    ? {
        requestId: `${thread.continuedRequest.requestThreadId}:continued`,
        city: thread.continuedRequest.cityContext,
        areas: [],
        topics: inferRequestTopics(thread.continuedRequest.requestMessage.body),
        requestKind: "restaurant_place" as const,
        lineRefs: lineLabel(thread.continuedRequest.requestMessage),
        expiresAtThreadBoundary: true,
      }
    : null;
  const text = threadText(thread.messages);
  return {
    threadId: thread.id,
    messages: thread.messages,
    activeRequest,
    continuationOf,
    cityFrame: thread.cityContext ?? thread.continuedRequest?.cityContext ?? activeRequest?.city ?? null,
    topicFrame: cleanList([
      ...(activeRequest?.topics ?? []),
      ...(continuationOf?.topics ?? []),
      ...inferRequestTopics(text),
    ]),
    blockedReason: semanticBlockReason(thread),
  };
}

function requestFrameFromExtraction(request: ExtractionRequest): RequestFrame {
  return {
    requestId: request.requestId,
    city: request.city,
    areas: request.areas,
    topics: request.topics,
    requestKind: request.requestKind,
    lineRefs: request.lines,
    expiresAtThreadBoundary: true,
  };
}

function semanticBlockReason(thread: ContextualThread) {
  const text = threadText(thread.messages);
  if (isEventAdminBlock(text) || thread.classification === "event_admin") return "event_admin";
  if (isRecipeOrIngredientContext(text)) return "recipe_home_cooking";
  if (thread.classification === "irrelevant") return "generic_chatter";
  return null;
}

function interpretCandidateMention(candidate: ReviewCandidate, frame: ThreadFrame): SemanticThreadResult {
  const text = `${candidate.anchorText} ${candidate.snippet ?? ""} ${candidate.note ?? ""}`;
  const blocked = frame.blockedReason as SemanticThreadRole | null;
  const threadRole: SemanticThreadRole = blocked ?? (foodSignalPattern.test(text) ? "restaurant_recommendation" : "food_discussion");
  const hardReject = isImpossibleFinalRestaurantName(candidate.restaurant) || isQuestionOnlyCandidate(candidate.snippet ?? "", candidate.snippet ?? "");
  const weak = isBareListCandidate(candidate) || candidate.city === "Unsorted";
  const decision = hardReject ? "reject" : candidate.semanticDecision ?? (weak ? "weak_possible" : "recommendation");
  return {
    threadRole,
    requestUpdates: [frame.activeRequest, frame.continuationOf].filter((request): request is RequestFrame => Boolean(request)),
    mentions: [
      {
        mentionId: stableHash([candidate.threadId, candidate.restaurant, candidate.candidateLines]),
        decision,
        restaurantSpan: candidate.restaurant,
        dishSpans: candidate.dishes ?? [],
        cuisineTags: candidate.tags ?? [],
        areaSpan: candidate.area ?? null,
        city: candidate.city ?? null,
        sentimentSpan: candidate.note ?? null,
        anchorLineRefs: [candidate.anchorLines],
        candidateLineRefs: [candidate.candidateLines],
        supportLineRefs: candidate.supportingLines ?? [],
        reason: hardReject
          ? "Structurally impossible restaurant span"
          : candidate.semanticDecision
            ? "Local model semantic decision"
          : weak
            ? "Weak deterministic evidence requires promotion"
            : "Deterministic evidence has restaurant and descriptor",
      },
    ],
  };
}

function normalizeRestaurantSpan(input: {
  restaurantSpan: string | null;
  fullMessageText: string;
  sentimentSpan: string | null;
  areaSpan: string | null;
  requestFrame: RequestFrame | null;
  candidate: ReviewCandidate;
}): NormalizedMention {
  const transformations: string[] = [];
  const raw = input.restaurantSpan?.trim() ?? "";
  if (!raw) return rejectNormalized("Missing restaurant span", transformations);

  let restaurant = cleanAnchoredRestaurantName(raw);
  if (restaurant !== raw) transformations.push("cleaned leading/trailing cues");

  const relation = splitRelationRestaurantSpan(restaurant, input.fullMessageText);
  if (relation) {
    restaurant = relation.restaurant;
    transformations.push(relation.transformation);
  }

  const nameParts = normalizeRestaurantNameAndArea(restaurant);
  restaurant = normalizeDisplayRestaurantName(titleCase(nameParts.restaurant));
  const area = normalizeAreaDisplay(input.areaSpan ?? input.candidate.area ?? nameParts.area ?? relation?.area ?? null);
  const dishes = cleanList([...(input.candidate.dishes ?? []), ...(relation?.dishes ?? [])]);
  const tags = cleanList([...(input.candidate.tags ?? []), ...inferTagsFromText(`${input.requestFrame?.topics.join(" ") ?? ""} ${input.fullMessageText}`)]);

  if (isImpossibleFinalRestaurantName(restaurant)) return rejectNormalized(`Impossible restaurant span: ${restaurant}`, transformations);

  if (!isPlausibleAnchoredRestaurantName(restaurant)) {
    return {
      status: "ambiguous",
      restaurant,
      area,
      dishes,
      tags,
      noteFragment: input.sentimentSpan,
      rejectionReason: "Restaurant span is plausible but not structurally strong",
      transformations,
    };
  }

  return {
    status: isBareListCandidate(input.candidate) ? "ambiguous" : "clean",
    restaurant,
    area,
    dishes,
    tags,
    noteFragment: input.sentimentSpan,
    rejectionReason: null,
    transformations,
  };
}

function rejectNormalized(reason: string, transformations: string[]): NormalizedMention {
  return {
    status: "reject",
    restaurant: null,
    area: null,
    dishes: [],
    tags: [],
    noteFragment: null,
    rejectionReason: reason,
    transformations,
  };
}

function splitRelationRestaurantSpan(restaurant: string, fullMessageText: string) {
  const dishFromPlace = fullMessageText.match(/^(?<dish>[a-z][\p{L}\p{N}'& .-]{2,}?)\s+from\s+(?<restaurant>[a-z][\p{L}\p{N}'& .-]{2,})$/iu);
  if (dishFromPlace?.groups && normalizeLoose(dishFromPlace.groups.restaurant) === normalizeLoose(restaurant)) {
    return {
      restaurant: dishFromPlace.groups.restaurant,
      area: null,
      dishes: [normalizeDishName(dishFromPlace.groups.dish)],
      transformation: "split dish-from-place relation",
    };
  }

  const placeInArea = fullMessageText.match(/^(?<restaurant>[A-Z0-9][\p{L}\p{N}'& .-]{2,}?)\s+(?:in|at)\s+(?<area>South Mumbai|Lalbaug|Kammanahalli|Indiranagar|Koramangala|Bandra|BKC|Domlur|Ulsoor|Sadashivnagar|C Scheme|HSR|Kalighat)$/iu);
  if (placeInArea?.groups && normalizeLoose(placeInArea.groups.restaurant) === normalizeLoose(restaurant)) {
    return {
      restaurant: placeInArea.groups.restaurant,
      area: placeInArea.groups.area,
      dishes: [],
      transformation: "split place-area relation",
    };
  }

  return null;
}

function promoteMention(
  candidate: ReviewCandidate,
  normalized: NormalizedMention,
  semantic: SemanticThreadResult,
  frame: ThreadFrame,
  thread: ContextualThread,
): PromotionDecision {
  const mention = semantic.mentions[0];
  const score = scorePromotion(candidate, normalized, semantic, frame);
  const utteranceRole = classifyUtteranceRole(candidate.snippet ?? "", candidate.restaurant, candidate.note ?? null);
  const normalizedRejectReason = normalized.status === "reject" ? normalized.rejectionReason : null;
  const baseEvidence = buildDebugEvidence(candidate, normalized, semantic, "park", "pending", score, utteranceRole);

  if (normalizedRejectReason) {
    return {
      decision: "reject",
      reason: normalizedRejectReason,
      score,
      evidence: { ...baseEvidence, promotionDecision: "reject", promotionReason: normalizedRejectReason },
      rejected: rejectThread(thread, normalizedRejectReason, candidate.snippet ?? candidate.restaurant),
    };
  }

  if (candidate.extractionMethod === "deterministic") {
    const reason = "Deterministic evidence requires Ollama semantic confirmation";
    const parked = applyPromotion(candidate, normalized, "parked", reason, Math.min(score, 0.69));
    return {
      decision: "park",
      reason,
      score: Math.min(score, 0.69),
      candidate: parked,
      evidence: buildDebugEvidence(parked, normalized, semantic, "park", reason, Math.min(score, 0.69), utteranceRole),
    };
  }

  const hardRejectReason = hardPromotionRejectReason(candidate, semantic, frame, utteranceRole);
  if (hardRejectReason) {
    return {
      decision: "reject",
      reason: hardRejectReason,
      score,
      evidence: { ...baseEvidence, promotionDecision: "reject", promotionReason: hardRejectReason },
      rejected: rejectThread(thread, hardRejectReason, candidate.snippet ?? candidate.restaurant),
    };
  }

  const canPromote =
    normalized.status === "clean" &&
    mention?.decision === "recommendation" &&
    semantic.threadRole === "restaurant_recommendation" &&
    isPromotableUtteranceRole(utteranceRole) &&
    score >= 0.85;
  const strongAnchoredPromotion =
    normalized.restaurant &&
    normalized.status !== "reject" &&
    mention?.decision === "recommendation" &&
    candidate.extractionMethod === "ollama" &&
    isPromotableUtteranceRole(utteranceRole) &&
    hasStrongAnchor(candidate) &&
    hasPositiveRecommendationIntent(candidate) &&
    hasSpecificFoodContext(candidate, frame) &&
    score >= 0.78 &&
    !isBareListCandidate(candidate);

  if (canPromote || strongAnchoredPromotion) {
    const promoted = applyPromotion(candidate, normalized, "final", "Passed semantic promotion gate", score);
    return {
      decision: "promote",
      reason: promoted.promotionReason ?? "Passed semantic promotion gate",
      score,
      candidate: promoted,
      evidence: buildDebugEvidence(promoted, normalized, semantic, "promote", promoted.promotionReason ?? "Passed semantic promotion gate", score, utteranceRole),
    };
  }

  const reason = parkReason(candidate, normalized, score);
  const parked = applyPromotion(candidate, normalized, "parked", reason, score);
  return {
    decision: "park",
    reason,
    score,
    candidate: parked,
    evidence: buildDebugEvidence(parked, normalized, semantic, "park", reason, score, utteranceRole),
  };
}

function applyPromotion(
  candidate: ReviewCandidate,
  normalized: NormalizedMention,
  reviewStatus: "final" | "parked",
  reason: string,
  score: number,
): ReviewCandidate {
  const restaurant = normalized.restaurant ?? candidate.restaurant;
  const city = normalizeCity(candidate.city) ?? candidate.city ?? "Unsorted";
  return {
    ...candidate,
    restaurant,
    restaurantSlug: slugify(restaurant),
    city,
    citySlug: slugify(city),
    area: normalized.area ?? candidate.area,
    dishes: cleanList([...(candidate.dishes ?? []), ...(normalized.dishes ?? [])]),
    tags: cleanList([...(candidate.tags ?? []), ...(normalized.tags ?? [])]),
    confidence: score,
    confidenceBand: confidenceBand(score),
    reviewStatus,
    promotionReason: reason,
    promotionEvidenceIds: [stableHash([candidate.threadId, candidate.restaurant, candidate.candidateLines])],
  };
}

function buildDebugEvidence(
  candidate: ReviewCandidate,
  normalized: NormalizedMention,
  semantic: SemanticThreadResult,
  decision: "promote" | "park" | "reject",
  reason: string,
  score: number,
  utteranceRole: UtteranceRole,
): DebugEvidenceCandidate {
  const mention = semantic.mentions[0];
  return {
    evidenceId: stableHash([candidate.threadId, candidate.restaurant, candidate.candidateLines]),
    threadId: candidate.threadId,
    restaurant: candidate.restaurant,
    candidateLines: candidate.candidateLines,
    anchorType: candidate.anchorType,
    anchorLines: candidate.anchorLines,
    semanticDecision: mention?.decision ?? "weak_possible",
    semanticReason: mention?.reason ?? "No semantic mention",
    normalizedStatus: normalized.status,
    normalizedRestaurant: normalized.restaurant,
    normalizedArea: normalized.area,
    normalizedDishes: normalized.dishes,
    normalizedTags: normalized.tags,
    promotionDecision: decision,
    promotionReason: reason,
    utteranceRole,
    score,
    snippet: candidate.snippet ?? null,
  };
}

function scorePromotion(
  candidate: ReviewCandidate,
  normalized: NormalizedMention,
  semantic: SemanticThreadResult,
  frame: ThreadFrame,
) {
  let score = 0.5;
  if (candidate.anchorType === "request_reply" || candidate.contextSource === "continued_request") score += 0.2;
  if (candidate.anchorType === "self_initiated") score += 0.18;
  if (normalized.status === "clean" && normalized.restaurant) score += 0.15;
  if (hasPositiveRecommendationIntent(candidate)) score += 0.1;
  if (candidate.city && candidate.city !== "Unsorted") score += 0.08;
  if (hasSpecificFoodContext(candidate, frame)) score += 0.06;
  if ((candidate.supportingLines ?? []).length > 0) score += 0.05;

  if (isBareListCandidate(candidate)) score -= 0.2;
  if (!candidate.city || candidate.city === "Unsorted") score -= 0.15;
  if (candidate.needsDescriptor && !hasPositiveRecommendationIntent(candidate) && !hasSpecificFoodContext(candidate, frame)) score -= 0.15;
  if (normalized.status === "ambiguous") score -= 0.1;
  if (isDishPersonOrProductAmbiguous(candidate.restaurant)) score -= 0.25;
  if (isQuestionOnlyCandidate(candidate.snippet ?? "", candidate.snippet ?? "")) score -= 0.3;
  if (semantic.threadRole === "event_admin" || semantic.threadRole === "recipe_home_cooking" || frame.blockedReason) score -= 0.4;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function hardPromotionRejectReason(candidate: ReviewCandidate, semantic: SemanticThreadResult, frame: ThreadFrame, utteranceRole: UtteranceRole) {
  if (semantic.threadRole === "event_admin") return "Thread is event/admin, not restaurant recommendation";
  if (semantic.threadRole === "recipe_home_cooking") return "Thread is recipe/home-cooking, not restaurant recommendation";
  if (semantic.threadRole === "generic_chatter") return "Thread is generic chatter";
  if (isImpossibleFinalRestaurantName(candidate.restaurant)) return `Impossible restaurant span: ${candidate.restaurant}`;
  if (!isPromotableUtteranceRole(utteranceRole)) return `Utterance is ${utteranceRole}, not a restaurant recommendation`;
  if (antiRecommendationPattern.test(`${candidate.snippet ?? ""} ${candidate.note ?? ""}`)) return "Negative or anti-recommendation evidence";
  if (!hasValidAnchor(candidate)) return "Missing valid recommendation anchor";
  if (frame.blockedReason) return `Blocked by ${frame.blockedReason}`;
  return null;
}

function classifyUtteranceRole(text: string, restaurant: string, note: string | null): UtteranceRole {
  const combined = `${text} ${note ?? ""}`.trim();
  const normalizedText = normalizeLoose(combined);
  const normalizedRestaurant = normalizeLoose(restaurant);
  const wordCount = normalizedText.split(/\s+/).filter(Boolean).length;
  const restaurantWordCount = normalizedRestaurant.split(/\s+/).filter(Boolean).length;

  if (/\b(?:image|video|sticker|audio|gif)\s+omitted\b/i.test(combined)) return "media_omitted";
  if (/^(?:lol|lmao|haha|hehe(?:\s+yes)?|aey+y+|yes|no|ok|okay|done|shit|thanks?|thank you|sweet|nice)$/i.test(combined.trim())) {
    return "acknowledgement";
  }
  if (/^(?:so\s+good|very\s+good|really\s+good|great|amazing|awesome|second that|finished already)$/i.test(combined.trim())) {
    return "supporting_sentiment";
  }
  if (/\b(?:parcel\s+some|finished already|running late|start without me|on my way|book tix|ticket|rsvp|guestlist|venue|poll|everyone)\b/i.test(combined)) {
    return "logistics";
  }
  if (/\?/.test(combined) || /^(?:what about|has anyone tried|did anyone try|anyone tried|is this|could this)\b/i.test(combined.trim())) {
    return "question_probe";
  }
  if (isLocationOnlyUtterance(combined, restaurant)) return "location_hint";
  if (isImpossibleFinalRestaurantName(restaurant) || isDishPersonOrProductAmbiguous(restaurant)) return "generic_chatter";
  if (restaurantWordCount === 1 && /^(?:brigade|lavelle|there|meanwhile|done|shit|lol|aey+y+)$/i.test(restaurant.trim())) {
    return "generic_chatter";
  }

  const hasPlaceName = normalizedRestaurant.length >= 3 && normalizedText.includes(normalizedRestaurant);
  const recommendationCue = /\b(?:try|go to|must(?:\s+go|\s+try)?|recommend|recommended|recommendation|recco|recos?|great|good|amazing|best|favorite|favourite|go[-\s]?to|solid|incredible|love|worth|famous for|called|there['’]?s|there is|has been|does good|is my gem|is my go[-\s]?to|one of the best)\b/i.test(combined);
  const relationCue = /\b(?:from|at|in|on)\s+[A-Z0-9][\p{L}\p{N}'& .-]{2,}/u.test(combined);
  const listLike = isListLikePlaceUtterance(combined, restaurant);

  if (hasPlaceName && recommendationCue) return "place_recommendation";
  if (hasPlaceName && relationCue && /\b(?:food|dish|sushi|cake|bakery|lassi|makkhan|thali|sea ?food|veg|vegetarian)\b/i.test(combined)) {
    return "place_recommendation";
  }
  if (listLike) return "place_list";
  if (wordCount <= 5 && /\b(?:good|great|amazing|awesome|best|solid|incredible)\b/i.test(combined) && !hasPlaceName) {
    return "supporting_sentiment";
  }
  return "generic_chatter";
}

function isPromotableUtteranceRole(role: UtteranceRole) {
  return role === "place_recommendation" || role === "place_list";
}

function isLocationOnlyUtterance(text: string, restaurant: string) {
  const cleaned = text.replace(/[.,]/g, " ").trim();
  const normalized = normalizeLoose(cleaned);
  const restaurantNormalized = normalizeLoose(restaurant);
  if (/\b(?:next to|near|around|in and around|city centre|city center)\b/i.test(cleaned) && !foodPlacePattern.test(cleaned) && !recommendationPattern.test(cleaned)) {
    return true;
  }
  const locationWords = ["mg road", "brigade", "lavelle", "indiranagar cult", "city centre", "city center", "cubbon", "church street"];
  if (locationWords.includes(normalized) || locationWords.includes(restaurantNormalized)) return true;
  if (/^(?:in\s+and\s+around\s+)?(?:mg road|brigade|lavelle|city centre|city center)(?:\s+etc)?$/i.test(cleaned)) return true;
  return false;
}

function isListLikePlaceUtterance(text: string, restaurant: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^(?:[-*•]|\d+\.)\s*\S/.test(trimmed)) return isPlausibleAnchoredRestaurantName(restaurant);
  const withoutRestaurant = normalizeLoose(trimmed.replace(new RegExp(escapeRegExp(restaurant), "i"), ""));
  if (!withoutRestaurant && isPlausibleAnchoredRestaurantName(restaurant)) return true;
  if (/^[\p{L}\p{N}'& .-]{2,}$/u.test(trimmed) && trimmed.split(/\s+/).length <= 5) {
    return isPlausibleAnchoredRestaurantName(restaurant) && !dishWordPattern.test(trimmed);
  }
  return false;
}

function parkReason(candidate: ReviewCandidate, normalized: NormalizedMention, score: number) {
  if (normalized.status === "ambiguous") return normalized.rejectionReason ?? "Ambiguous restaurant span";
  if (isBareListCandidate(candidate)) return "Bare list item without enough descriptor for final promotion";
  if (!candidate.city || candidate.city === "Unsorted") return "Missing bounded city context";
  if (candidate.needsDescriptor) return candidate.descriptorReason ?? "Weak community descriptor";
  return `Semantic promotion score ${score} below final threshold`;
}

function hasValidAnchor(candidate: ReviewCandidate) {
  return ["request_reply", "self_initiated", "curated_list", "maps_link"].includes(candidate.anchorType);
}

function hasStrongAnchor(candidate: ReviewCandidate) {
  return candidate.anchorType === "request_reply" || candidate.anchorType === "self_initiated" || candidate.contextSource === "continued_request";
}

function hasPositiveRecommendationIntent(candidate: ReviewCandidate) {
  return /\b(try|go to|must|recommend|recommendation|great|good|amazing|best|favorite|favourite|go\s*to|solid|incredible|love|worth|shouldn'?t miss|to die for|revamped)\b/i.test(
    `${candidate.anchorText} ${candidate.snippet ?? ""} ${candidate.note ?? ""}`,
  );
}

function hasSpecificFoodContext(candidate: ReviewCandidate, frame: ThreadFrame) {
  const topics = cleanList([...(candidate.tags ?? []), ...(candidate.dishes ?? []), ...frame.topicFrame]);
  return topics.some((topic) => !["food", "lunch", "dinner", "breakfast", "buffet", "bar"].includes(topic.toLowerCase()));
}

function isBareListCandidate(candidate: ReviewCandidate) {
  return (
    candidate.anchorType === "curated_list" &&
    candidate.needsDescriptor &&
    !(candidate.note && hasCommunityDescriptor(candidate.note)) &&
    !/[.!?]/.test(candidate.snippet ?? "")
  );
}

function isDishPersonOrProductAmbiguous(restaurant: string) {
  const normalized = normalizeLoose(restaurant);
  if (/\b(menu items?|packaging|box|recipe|ingredients?)\b/i.test(restaurant)) return true;
  return [
    "ragi mudde",
    "cucumber cooler",
    "coffee ice cream",
    "jackfruit icecream",
    "healthy breakfast recipes",
    "dosa",
    "dosas",
    "pulav",
    "sushi",
    "lassi",
  ].includes(normalized);
}

function isImpossibleFinalRestaurantName(value: string) {
  const cleaned = normalizeLoose(value);
  if (!cleaned) return true;
  if (/^(done|yes|no|okay|ok|meanwhile|everyone|poll|there|super|nice|sweet|thanks?|thank you|image omitted)$/i.test(value.trim())) return true;
  if (/\b(to have a side adventure|the best cakes|the new menu items|world famous tea|next to|near my house|around cubbon|in the old city|final guestlist|guestlist|rsvp|ticket|venue)\b/i.test(value)) {
    return true;
  }
  if (/\b(needs to catch|adopt|foster|spreading the word|is done)\b/i.test(value)) return true;
  if (/\b(does good|is amazing|is great|is good|has recently revamped)\b/i.test(value) && value.split(/\s+/).length > 3) return true;
  return false;
}

function isSupportingNote(body: string) {
  if (/\bfavou?rite city\b|\bretire there\b/i.test(body)) return false;
  if (/\b(?:try|go to|called)\s+[A-Z0-9]/i.test(body) || /^(?:there['’]?s|there is)\s+[A-Z0-9]/i.test(body)) return false;
  return /\b(there|this place|it|that place)\b/i.test(body) && (hasCommunityDescriptor(body) || inferDishesFromText(body).length > 0);
}

function hasCommunityDescriptor(body: string) {
  return /\b(good|great|best|must|love|awesome|delicious|really|worth|miss|favourite|favorite|to die for|vibe|ambience|nice)\b/i.test(body);
}

function extractInlineDescriptor(snippet: string) {
  if (!/\btry\b/i.test(snippet)) return null;
  const tail = snippet.replace(/^[\s\S]*?\btry\s+.+?[.!?]\s*/i, "").trim();
  return tail && hasCommunityDescriptor(tail) ? sentence(tail) : null;
}

function summarizeExtraction(
  runId: string,
  inputName: string,
  parsedMessageCount: number,
  broadClusterCount: number,
  threadCount: number,
  candidates: ReviewCandidate[],
  parked: ReviewCandidate[],
  debugEvidence: DebugEvidenceCandidate[],
  requests: ExtractionRequest[],
  rejected: RejectedExtraction[],
): ExtractionSummary {
  return {
    runId,
    inputName,
    parsedMessageCount,
    broadClusterCount,
    threadCount,
    requestCount: requests.length,
    resolvedRequestCount: requests.filter((request) => request.status === "resolved").length,
    unresolvedRequestCount: requests.filter((request) => request.status === "unresolved").length,
    finalCandidateCount: candidates.length,
    parkedCount: parked.length,
    debugMentionCount: debugEvidence.length,
    acceptedCount: candidates.length,
    rejectedCount: rejected.length,
    byCity: countBy(candidates.map((candidate) => candidate.city ?? "Unsorted")),
    byTag: countBy(candidates.flatMap((candidate) => candidate.tags ?? [])),
    byDish: countBy(candidates.flatMap((candidate) => candidate.dishes ?? [])),
    byConfidenceBand: {
      likely_importable: candidates.filter((candidate) => candidate.confidenceBand === "likely_importable").length,
      review_required: candidates.filter((candidate) => candidate.confidenceBand === "review_required").length,
      rejected: 0,
    },
    rejectionReasons: countBy(rejected.map((item) => item.reason)),
    parkReasons: countBy(parked.map((item) => item.promotionReason ?? "Parked by semantic promotion")),
    promotionReasons: countBy(candidates.map((item) => item.promotionReason ?? "Promoted by semantic promotion")),
  };
}

function inferThreadCity(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [alias, city] of cityAliases) {
    if (new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i").test(lower)) return city;
  }
  for (const [area, city] of areaAliases) {
    if (new RegExp(`\\b${escapeRegExp(area)}\\b`, "i").test(lower)) return city;
  }
  return null;
}

function normalizeCity(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "unsorted" || normalized === "unknown") return "Unsorted";
  return cityAliases.get(normalized) ?? areaAliases.get(normalized) ?? null;
}

function rejectThread(thread: ContextualThread, reason: string, snippet = ""): RejectedExtraction {
  return {
    threadId: thread.id,
    reason,
    classification: thread.classification,
    snippet: truncate(snippet || threadText(thread.messages), 240),
    start: thread.start,
    end: thread.end,
    lineStart: thread.lineStart,
    lineEnd: thread.lineEnd,
  };
}

function buildThreadRequests(thread: ContextualThread): ExtractionRequest[] {
  return thread.messages
    .filter((message) => isAsk(message.body))
    .map((message) => {
      const requestKind = classifyRequestKind(message.body);
      const city = inferThreadCity(message.body) ?? thread.cityContext;
      return {
        requestId: requestIdFor(thread, message),
        threadId: thread.id,
        sender: firstName(message.sender),
        text: truncate(message.body, 240),
        lines: lineLabel(message),
        timestamp: message.timestamp.toISOString(),
        city,
        areas: inferAreas(message.body),
        topics: inferRequestTopics(message.body),
        requestKind,
        status: requestKind === "restaurant_place" || requestKind === "dish_at_known_place" ? "unresolved" : "rejected",
        resolvedCandidateIds: [],
        rejectionReason: requestKind === "recipe" ? "Recipe/home-cooking request" : requestKind === "event" ? "Event/logistics request" : undefined,
      };
    });
}

function resolveRequestStatuses(requests: ExtractionRequest[], candidates: ReviewCandidate[]) {
  return requests.map((request) => {
    if (request.status === "rejected") return request;
    const resolved = candidates.filter((candidate) => candidate.requestId === request.requestId);
    return {
      ...request,
      status: resolved.length > 0 ? ("resolved" as const) : ("unresolved" as const),
      resolvedCandidateIds: resolved.map((candidate) => candidate.sourceHash).filter((hash): hash is string => Boolean(hash)),
    };
  });
}

function dedupeRequests(requests: ExtractionRequest[]) {
  const seen = new Map<string, ExtractionRequest>();
  for (const request of requests) seen.set(request.requestId, request);
  return [...seen.values()];
}

function requestIdFor(thread: ContextualThread, message: WhatsAppMessage) {
  return `${thread.id}:request:${message.lineStart}-${message.lineEnd}`;
}

function anchorFromRequest(thread: ContextualThread, request: WhatsAppMessage, anchorType: AnchorType, anchorReason: string): CandidateAnchor {
  return {
    anchorType,
    anchorConfidence: anchorType === "curated_list" ? 0.88 : 0.84,
    anchorReason,
    anchorText: truncate(request.body, 220),
    anchorSender: firstName(request.sender),
    anchorLines: lineLabel(request),
    requestId: requestIdFor(thread, request),
    contextSource: "same_thread",
    contextLines: lineLabel(request),
  };
}

function continuationAnchor(thread: ContextualThread): CandidateAnchor | null {
  const continued = thread.continuedRequest;
  if (!continued) return null;
  return {
    anchorType: "curated_list",
    anchorConfidence: 0.82,
    anchorReason: "Candidate appears in an explicit continuation of a prior food/place request",
    anchorText: truncate(continued.requestMessage.body, 220),
    anchorSender: firstName(continued.requestMessage.sender),
    anchorLines: continued.contextLines,
    requestId: requestIdFor({ ...thread, id: continued.requestThreadId }, continued.requestMessage),
    contextSource: "continued_request",
    contextLines: continued.contextLines,
  };
}

function selfAnchorFromMessage(message: WhatsAppMessage): CandidateAnchor | null {
  if (!hasFoodContext(message.body) || (!selfRecommendationCuePattern.test(message.body) && !isSelfRecommendationStatement(message.body))) return null;
  const hasMapsLink = /\b(?:maps\.app|google\.com\/maps|goo\.gl\/maps)\b/i.test(message.body);
  return {
    anchorType: hasMapsLink ? "maps_link" : "self_initiated",
    anchorConfidence: hasMapsLink ? 0.9 : 0.8,
    anchorReason: hasMapsLink
      ? "Candidate message includes a food-place cue and a Maps link"
      : "Message contains an explicit self-initiated recommendation cue",
    anchorText: truncate(message.body, 220),
    anchorSender: firstName(message.sender),
    anchorLines: lineLabel(message),
    contextSource: "same_thread",
    contextLines: lineLabel(message),
  };
}

function classifyRequestKind(body: string): RequestKind {
  if (eventAdminBlockPattern.test(body)) return "event";
  if (/\bwhat (?:are|should).{0,80}\btry there\b/i.test(body)) return "dish_at_known_place";
  if (isFoodRecommendationRequest(body) || isCuisineRecommendationRequest(body)) return "restaurant_place";
  if (isRecipeOrIngredientContext(body)) return "recipe";
  return "other";
}

function inferAreas(text: string) {
  return [...areaAliases.keys()]
    .filter((area) => new RegExp(`\\b${escapeRegExp(area)}\\b`, "i").test(text))
    .map(titleCase);
}

function inferRequestTopics(text: string) {
  const topics = [
    ["bakery", /\bbaker(?:y|ies)\b/i],
    ["cake", /\bcakes?\b/i],
    ["dinner", /\bdinner\b/i],
    ["lunch", /\blunch\b/i],
    ["buffet", /\bbuffet\b/i],
    ["sushi", /\bsushi\b/i],
    ["vegetarian", /\bvegetarian|pure veg|veg(?:etarian)? food\b/i],
    ["seafood", /\bsea ?food\b/i],
    ["bar", /\b(?:cocktails?|wine|alcohol)\b|(?<!price no )\bbar\b/i],
    ["cafe", /\bcafes?\b/i],
    ["breakfast", /\bbreakfast\b/i],
    ["dessert", /\bdesserts?\b/i],
    ["snacks", /\bsnacks?|khamani|kachoris?\b/i],
  ] as const;
  return cleanList([...topics.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic), ...inferCuisineTags(text)]);
}

function findReferenceMessage(thread: ContextualThread, snippetOrRestaurant: string | undefined, sourceName?: string) {
  const snippet = snippetOrRestaurant?.toLowerCase().slice(0, 48);
  if (snippet) {
    const match = thread.messages.find((message) => message.body.toLowerCase().includes(snippet));
    if (match) return match;
  }
  if (sourceName) {
    const source = firstName(sourceName).toLowerCase();
    const match = thread.messages.find((message) => firstName(message.sender).toLowerCase() === source);
    if (match) return match;
  }
  return thread.messages.find((message) => recommendationPattern.test(message.body)) ?? thread.messages[0]!;
}

function findCandidateMessage(thread: ContextualThread, candidate: AnchorableCandidate) {
  const range = parseLineRef(candidate.rawRefLabel);
  if (range) {
    const byRange = thread.messages.find(
      (message) => message.lineStart <= range.start && message.lineEnd >= range.end,
    );
    if (byRange) return byRange;
  }

  const snippet = candidate.snippet?.toLowerCase().slice(0, 48);
  if (snippet) {
    const bySnippet = thread.messages.find((message) => message.body.toLowerCase().includes(snippet));
    if (bySnippet) return bySnippet;
  }

  return thread.messages[0]!;
}

function resolveCandidateAnchor(
  candidate: AnchorableCandidate,
  thread: ContextualThread,
  candidateMessage = findCandidateMessage(thread, candidate),
): CandidateAnchor | null {
  const evidence = candidateEvidence(candidate);
  const messageBody = candidateMessage.body;
  const candidateLines = lineLabel(candidateMessage);

  if (isDisqualifiedCandidate(candidate, messageBody, evidence)) return null;

  if (candidate.googleMapsUrl && hasFoodContext(evidence)) {
    return {
      anchorType: "maps_link",
      anchorConfidence: 0.9,
      anchorReason: "Candidate message includes a food-place cue and a Maps link",
      anchorText: truncate(messageBody, 220),
      anchorSender: firstName(candidateMessage.sender),
      anchorLines: candidateLines,
    };
  }

  const request = nearestPriorRequest(thread, candidateMessage);
  const isList = isLikelyListCandidate(candidate, candidateMessage);
  if (request && isList) {
    return {
      anchorType: "curated_list",
      anchorConfidence: 0.86,
      anchorReason: "Place list appears after an explicit food/place request",
      anchorText: truncate(request.body, 220),
      anchorSender: firstName(request.sender),
      anchorLines: lineLabel(request),
      requestId: requestIdFor(thread, request),
    };
  }

  if (request && !isFoodRecommendationRequest(messageBody)) {
    return {
      anchorType: "request_reply",
      anchorConfidence: 0.84,
      anchorReason: "Candidate follows an explicit food/place request in the same mini-thread",
      anchorText: truncate(request.body, 220),
      anchorSender: firstName(request.sender),
      anchorLines: lineLabel(request),
      requestId: requestIdFor(thread, request),
    };
  }

  if (hasSelfRecommendationCue(evidence, candidate.restaurant)) {
    return {
      anchorType: "self_initiated",
      anchorConfidence: 0.82,
      anchorReason: "Candidate message contains an explicit recommendation cue",
      anchorText: truncate(messageBody, 220),
      anchorSender: firstName(candidateMessage.sender),
      anchorLines: candidateLines,
    };
  }

  if (isList && hasFoodListHeading(messageBody)) {
    return {
      anchorType: "curated_list",
      anchorConfidence: 0.78,
      anchorReason: "Candidate appears under a food/place list heading",
      anchorText: truncate(messageBody, 220),
      anchorSender: firstName(candidateMessage.sender),
      anchorLines: candidateLines,
    };
  }

  return null;
}

function nearestPriorRequest(thread: ContextualThread, candidateMessage: WhatsAppMessage) {
  return [...thread.messages]
    .filter(
      (message) =>
        message.timestamp.getTime() <= candidateMessage.timestamp.getTime() &&
        message !== candidateMessage &&
        isFoodRecommendationRequest(message.body),
    )
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())[0] ?? null;
}

function isDisqualifiedCandidate(candidate: AnchorableCandidate, messageBody: string, evidence: string) {
  if (antiRecommendationPattern.test(evidence)) return true;
  if (recipePattern.test(evidence)) return true;
  if (isRecipeOrIngredientContext(messageBody)) return true;
  if (isEventAdminBlock(messageBody)) return true;
  if (isQuestionOnlyCandidate(candidate.restaurant, evidence)) return true;
  if (isDishOrIngredientCandidate(candidate.restaurant, evidence)) return true;
  if (isNonPlaceTryPhrase(candidate.restaurant, evidence)) return true;
  if (
    !messageBody.includes("\n") &&
    normalizeLoose(messageBody) === normalizeLoose(candidate.restaurant) &&
    normalizeLoose(evidence) === normalizeLoose(candidate.restaurant)
  ) {
    return true;
  }
  if (/\bconversation\b/i.test(candidate.restaurant) || /\binteresting conversation\b/i.test(evidence)) return true;
  if (/\b(my name is|i am|i'm)\b/i.test(messageBody) && /\b(cheers|regards|hello everyone)\b/i.test(messageBody)) {
    return true;
  }
  if (isFoodRecommendationRequest(messageBody) && !hasSelfRecommendationCue(evidence, candidate.restaurant)) {
    return true;
  }
  if (/^(poll|everyone|hahah|heyyy|chalo sab|quick question|when in doubt|folks a lil help)$/i.test(candidate.restaurant.trim())) {
    return true;
  }
  if (/\b(running a little late|should be there by|have my exams|book tix|take loads of pix)\b/i.test(evidence)) {
    return true;
  }
  return false;
}

function candidateEvidence(candidate: AnchorableCandidate) {
  return `${candidate.restaurant} ${candidate.snippet ?? ""} ${candidate.note ?? ""}`;
}

function hasFoodContext(value: string) {
  return foodSignalPattern.test(value) || dishWordPattern.test(value) || foodPlacePattern.test(value);
}

function hasSelfRecommendationCue(evidence: string, restaurant: string) {
  if (antiRecommendationPattern.test(evidence)) return false;
  if (!hasFoodContext(evidence)) return false;
  if (selfRecommendationCuePattern.test(evidence)) return true;
  return new RegExp(`\\b${escapeRegExp(restaurant)}\\b[\\s\\S]{0,80}\\b(?:good|great|awesome|incredible|must|worth)\\b`, "i").test(
    evidence,
  );
}

function isQuestionOnlyCandidate(restaurant: string, evidence: string) {
  return /^(what about|did anyone|has anyone|anyone tried|can anyone|should i|where do|where should)\b/i.test(
    restaurant.trim(),
  ) || /\b(did anyone try it|has anyone tried|anyone been to|what about)\b/i.test(evidence);
}

function isFoodRecommendationRequest(body: string) {
  if (isRecipeOrIngredientContext(body) && !hasPlaceRecommendationAsk(body)) return false;
  if (/\b(packaging|takeaway packaging|design|functionally sound|inside the box|app illustrations)\b/i.test(body)) return false;
  if (isSelfRecommendationStatement(body)) return false;
  if (/^\s*open to any\b/i.test(body)) return false;
  if (/^\s*there[’']?s also one\b[\s\S]{0,120}\bforgot name\b/i.test(body)) return false;
  if (/^(?:there'?s|there is)\s+[A-Z0-9][\s\S]{0,120}\b(?:good|great|fantastic|options for vegetarians)\b/i.test(body)) return false;
  if (/\bwhat was so interesting\b/i.test(body)) return false;
  if (/\bspace for dinner\b/i.test(body)) return false;
  if (/\b(?:makes|made|cooks?|cooked)\b[\s\S]{0,80}\b(food|irani|dish|dishes|recipes?)\b/i.test(body)) return false;
  if (eventAdminBlockPattern.test(body) && !/\b(food recommendations?|reccos?|recos?)\b/i.test(body)) return false;
  return (
    isCuisineRecommendationRequest(body) ||
    isCitySeekingRecommendationRequest(body) ||
    hasPlaceRecommendationAsk(body) ||
    askPattern.test(body) ||
    foodRequestPattern.test(body) ||
    /\b(food|restaurant|cafe|bakery|bakeries|cake|dinner|lunch|breakfast|dessert|bar|buffet|sushi|sea ?food|vegetarian|veg)\s+(?:recs?|recos?|reccos?|recommendations?)\b/i.test(body) ||
    /\b(food|restaurant|cafe|bakery|bakeries|cake|dinner|lunch|breakfast|dessert|bar|buffet|sushi|sea ?food|vegetarian|veg)\s+recommendations?(?:\s*\([^)]+\))?/i.test(body) ||
    /\brecommendations?(?:\s*\([^)]+\))?[\s\S]{0,80}\b(around|near|for|in)\b/i.test(body) ||
    /\bgive recommendations? to eat\b/i.test(body) ||
    /\bwhere do you get\b[\s\S]{0,80}\b(bread|dosa|food|coffee|chai|dessert)\b/i.test(body) ||
    /\bany new places?\b[\s\S]{0,80}\b(dosa|food|restaurant|cafe|bakery|breakfast|lunch|dinner)\b/i.test(body)
  );
}

function isSelfRecommendationStatement(body: string) {
  return /\b(?:my\s+(?:biggest\s+)?recommendation|i\s+would\s+recommend|i'?d\s+recommend)\b[\s\S]{0,80}\b(?:would be|with|try|replacing|go to|at|in)\b/i.test(body);
}

function isCuisineRecommendationRequest(body: string) {
  if (!inferCuisineTags(body).length) return false;
  const cuisineWords = cuisinePatterns.map(([tag]) => tag).join("|");
  return (
    /\b(want|wanna|looking for|need|craving|eat|eating)\b[\s\S]{0,120}\b(food|places?|spots?|restaurants?)\b[\s\S]{0,80}\b(recommendations?|reccos?|recos?|recs?)\b/i.test(body) ||
    new RegExp(`\\b(want|wanna|looking for|need|craving|eat|eating)\\b[\\s\\S]{0,120}\\b(${cuisineWords})\\b[\\s\\S]{0,80}\\b(food|places?|spots?|restaurants?)\\b`, "i").test(body) ||
    new RegExp(`\\b(${cuisineWords})\\s+(?:food\\s+)?(?:recs?|recos?|reccos?|recommendations?|places?|spots?|restaurants?)\\b`, "i").test(body) ||
    new RegExp(`\\b(?:good|authentic|solid)\\s+(${cuisineWords})\\b[\\s\\S]{0,80}\\b(recommendations?|reccos?|recos?|recs?)\\b`, "i").test(body)
  );
}

function isRecipeOrIngredientContext(body: string) {
  return /\b(recipes?|ingredients?|home chef|home[- ]?cooking|cook(?:ing|ed)?|try it at home|healthy breakfast recipes?)\b/i.test(
    body,
  );
}

function hasPlaceRecommendationAsk(body: string) {
  return (
    /\b(?:please\s+)?(?:shoot|send|drop|share|give)\b[\s\S]{0,80}\b(recos?|reccos?|recs?|recommendations?|must try)\b/i.test(body) ||
    /\b(seeking|looking for|need|want|any|top)\b[\s\S]{0,80}\b(recommendations?|recos?|reccos?|recs?|places?|spots?)\b/i.test(body) ||
    /\b(recommendations?|recos?|reccos?|recs?)\b[\s\S]{0,80}\b(?:in|around|near|for)\b/i.test(body) ||
    /\bmust try\b[\s\S]{0,80}\b(?:places?|food|restaurants?|cafes?|bakeries|snacks?|thali|dhabas?)\b/i.test(body)
  );
}

function isCitySeekingRecommendationRequest(body: string) {
  if (!inferThreadCity(body)) return false;
  return /\b(?:new city|seeking recommendations?|batao na|please (?:shoot|send|drop|share).{0,30}(?:recos?|reccos?|recs?))\b/i.test(body);
}

function isDishOrIngredientCandidate(restaurant: string, evidence: string) {
  const normalized = restaurant.trim().toLowerCase();
  if (/\b(milky mist|skyr|soft boiled eggs?|chilli oil|african|chile|french one)\b/i.test(evidence)) return true;
  if (
    /^(kadhi chawal|chole kulche|mutton waala saag|aloo gobhi|amritsari paneer ki bhurji|two soft boiled eggs?|chilli oil|aperol cocktails?|tempura|must visit)$/i.test(
      normalized,
    )
  ) {
    return true;
  }
  return false;
}

function isNonPlaceTryPhrase(restaurant: string, evidence: string) {
  const normalized = restaurant.trim().toLowerCase();
  return (
    /^(get hold of it sometime|and get hold of it sometime|to develop my taste(?: for it)?|something new)$/i.test(normalized) ||
    /\b(must try and get hold of it|try to develop my taste|wanted to try something new|manav kaul the actor)\b/i.test(evidence)
  );
}

function isEventAdminBlock(body: string) {
  return eventAdminBlockPattern.test(body) || (eventPattern.test(body) && /\b(ticket|tix|guest|venue|agenda|rsvp)\b/i.test(body));
}

function isLikelyListCandidate(candidate: AnchorableCandidate, message: WhatsAppMessage) {
  if (!message.body.includes("\n")) return false;
  const snippet = candidate.snippet?.trim();
  if (!snippet) return false;
  return message.body
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+\.|[-*•⁠])\s*/, "").replace(/^\*|\*$/g, "").trim())
    .some((line) => line.localeCompare(snippet, undefined, { sensitivity: "accent" }) === 0);
}

function hasFoodListHeading(body: string) {
  return body
    .split(/\r?\n/)
    .slice(0, 4)
    .some((line) => foodListHeadingPattern.test(line));
}

function isCategoryHeading(value: string) {
  const cleaned = value.replace(/[-:]+$/, "").trim();
  return foodListHeadingPattern.test(cleaned) || /^(for .*|good .*|best .*|late night.*|thalis?|sea ?food|morning breakfast)$/i.test(cleaned);
}

function parseLineRef(label: string) {
  const match = label.match(/lines?\s+(\d+)(?:-(\d+))?/i);
  if (!match?.[1]) return null;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
}

function lineLabel(message: WhatsAppMessage) {
  return `lines ${message.lineStart}-${message.lineEnd}`;
}

function isAsk(body: string) {
  if (isSelfRecommendationStatement(body)) return false;
  return isFoodRecommendationRequest(body) || /\b(recco|recos?|recs?|recommendations?)\b/i.test(body);
}

function hasFoodSignal(body: string) {
  return foodSignalPattern.test(body);
}

function isEventAdmin(body: string) {
  return eventPattern.test(body);
}

function looksLikeRestaurantLine(body: string) {
  const clean = body.replace(/^\s*(?:\d+\.|[-*•])\s*/, "").trim();
  if (isBadRestaurantName(clean)) return false;
  if (eventPattern.test(clean) && !foodSignalPattern.test(clean)) return false;
  return (
    recommendationPattern.test(clean) ||
    /^[A-Z][\p{L}\p{N}'& .-]{2,}(?:\s*\(.+\)|\s*-\s*.+|:)?$/u.test(clean)
  );
}

function isBadRestaurantName(value: string) {
  const text = value.replace(/[*_]/g, "").trim();
  if (!text || text.length < 3 || text.length > 80) return true;
  if (text.split(/\s+/).length > 6) return true;
  if (/^(notes?|latest rsvps?|finali[sz]ed rsvps?|participants?|attendees?|who all|adding me|all good|best|best cafes of jaipur|poll|everyone|ever|there|here|it|this place|that place|same area|the same area|to die for|worth it|really good|best one|something new|higher chances of getting in|running a little late|jaipur iternary|jaipur itinerary|done|meanwhile|gender studies)$/i.test(text)) return true;
  if (/^(wow|hey|heyyy|hahah|yess?|okay|ok|yes|no|done|thanks?|sure|also|actually|which|this|that|it|there|here|everything|final|moving|another|just|we|i|one|quick question|folks|open to any|adding to|the one in|next to|go before|go after|after \d|before \d|best batches)\b/i.test(text)) return true;
  if (/\bfrom\b/i.test(text)) return true;
  if (/\b(namma yatri|ola|uber|rapido|ticket|tickets|tix)\b/i.test(text)) return true;
  if (/\b(world famous tea|side adventure|best cakes?|new menu items?|a la carte menu|small town taste|absolute favorite|have my exams|ragi mudde|dosas?|pulav|cucumber cooler|coffee ice cream|jackfruit icecream)\b/i.test(text)) return true;
  if (/\b(i|you|we|they|thanks|experience|thought|point|sense check|name dropping|conditions of cooking|put together|try something new|get hold of it|develop my taste)\b/i.test(text)) {
    return true;
  }
  if (eventPattern.test(text) && !foodSignalPattern.test(text)) return true;
  if (/^[-\d.\s]+$/.test(text)) return true;
  return false;
}

function normalizeDeterministicRestaurantName(value: string) {
  return value
    .replace(/[\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069]/g, "")
    .replace(/^(?:italian|indian|chinese|bengali|calcutta biryani|sea ?food|for cake cake|cake cake)\s*-\s*/i, "")
    .replace(/^(?:and|also|can try|do try|please try|please go to)\s+/i, "")
    .replace(/^my\s+go\s+to\s+place\s+is\s+/i, "")
    .replace(/^place\s+is\s+/i, "")
    .replace(/^try\s+(?:the\s+)?/i, "")
    .replace(/\s+(?:was|is|looks|has been)\s+(?:incredible|great|good|awesome|promising).*$/i, "")
    .replace(/\s+(?:too|as well)$/i, "")
    .replace(/\s+for\s+(?:dosa|dosas|chai|coffee|thali|ice creams?|kebabs?|bun tikki|their famed dessert|desserts?|pork dishes?).*$/i, "")
    .trim();
}

function normalizeRestaurantNameAndArea(value: string) {
  const cleaned = normalizeDeterministicRestaurantName(value);
  const locationHint = cleaned.match(/^(?<restaurant>.+?)\s+(?:in|at)\s+(?<area>South Mumbai|Lalbaug|Kammanahalli|Indiranagar|Koramangala|Bandra|BKC|Domlur|Ulsoor|Sadashivnagar|C Scheme|HSR|Kalighat)$/i);
  if (locationHint?.groups) {
    return {
      restaurant: locationHint.groups.restaurant.trim(),
      area: titleCase(locationHint.groups.area.trim()),
    };
  }
  return { restaurant: cleaned, area: null };
}

function inferDishesFromText(text: string): string[] {
  const dishes = [
    ["nihari", /\bnihari\b/i],
    ["fried chicken", /\bfried chicken\b/i],
    ["ravioli", /\bravi?olli\b/i],
    ["aperol cocktails", /\baperol cocktails?\b/i],
    ["tempura", /\btempura\b/i],
    ["dal pakwan", /\bdal pakwan\b/i],
    ["junglee maas", /\bjunglee maas\b/i],
    ["lal maas", /\blal maas\b/i],
    ["tandoori chai", /\btandoori chai\b/i],
    ["kachori", /\bkachoris?\b/i],
    ["tiramisu", /\btiramisu\b/i],
    ["cake", /\bcakes?\b/i],
    ["dosa", /\bdosas?\b/i],
    ["lassi", /\blassi\b/i],
    ["meetha makkhan", /\bmeetha mak+k?han\b/i],
    ["sushi", /\bsushi\b/i],
    ["kimchi", /\bkimchi\b/i],
    ["gimbap", /\bgimbap|kimbap\b/i],
    ["ramen", /\bramen|ramyun\b/i],
    ["biryani", /\bbiryani\b/i],
    ["chicken roll", /\bchicken roll\b/i],
    ["cremino", /\bcremino\b/i],
    ["pork", /\bpork\b/i],
  ] as const;
  return dishes.filter(([, pattern]) => pattern.test(text)).map(([dish]) => dish);
}

function inferTagsFromText(text: string): string[] {
  const tags = [
    ["cafe", /\bcafes?\b/i],
    ["bar", /\bcocktails?|wine|alcohol\b|(?<!price no )\bbar\b/i],
    ["bakery", /\bbakery|bakeries|cakes?|pastry|patisserie\b/i],
    ["beverages", /\bchai|coffee|beverages?\b/i],
    ["snacks", /\bsnacks?|kachoris?\b/i],
    ["seafood", /\bsea ?food\b/i],
    ["vegetarian", /\bvegetarian|pure veg|veg(?:etarian)? food\b/i],
  ] as const;
  return cleanList([...tags.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag), ...inferCuisineTags(text)]);
}

function inferCuisineTags(text: string) {
  return cuisinePatterns.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
}

function cuisineTagsFromAnchor(anchor: CandidateAnchor | null) {
  return anchor ? inferCuisineTags(anchor.anchorText) : [];
}

function isPlausibleListRestaurant(value: string) {
  const cleaned = value.replace(/\(.+\)/g, "").trim();
  if (isBadRestaurantName(cleaned)) return false;
  if (/\b(best|go before|go after|must visit|vibe|batches|restaurant|cafe|snacks?|kachoris?)\b/i.test(cleaned)) return false;
  return /^[A-Z0-9][\p{L}\p{N}'& .-]{2,}$/u.test(cleaned);
}

function isPlausibleCuisineRestaurantName(value: string) {
  const cleaned = value.replace(/\(.+\)/g, "").trim();
  if (isBadRestaurantName(cleaned)) return false;
  if (/^(another fabulous place|the owner|she|he|it|what about|did anyone|anyone|nothing beats this)$/i.test(cleaned)) return false;
  return /^[A-Z0-9][\p{L}\p{N}'& .-]{2,}$/u.test(cleaned);
}

function isWeakNegativeEvidence(value: string | null | undefined) {
  return /\b(quality has been off|sadly|last \d+ visits|doesn'?t allow|don't go|dont go|avoid|not good|bad)\b/i.test(value ?? "");
}

function splitPlaceList(value: string) {
  return value
    .split(/\s*,\s*/)
    .map((piece) => piece.replace(/\(.+?\)/g, "").replace(/\bplease avoid\b.*$/i, "").replace(/[.!?]+$/g, "").trim())
    .filter((piece) => piece && isPlausibleListRestaurant(piece));
}

function isPlausibleDishFromPlace(dish: string, restaurant: string) {
  const normalizedDish = normalizeDishName(dish);
  const cleanedRestaurant = restaurant.trim();
  if (!inferDishesFromText(normalizedDish).length) return false;
  if (normalizedDish.split(/\s+/).length > 4) return false;
  if (/^(look|order|get|try|please|can|does|any|what|where|who|how)\b/i.test(dish.trim())) return false;
  if (/\s+-\s+|\bin that case\b|\bif possible\b|\bfor this\b|\bthere\b/i.test(cleanedRestaurant)) return false;
  return !isBadRestaurantName(cleanedRestaurant);
}

function normalizeDisplayRestaurantName(value: string) {
  return value
    .replace(/\bGc Dairy\b/g, "GC Dairy")
    .replace(/^Ctr$/i, "CTR")
    .replace(/^Mtr$/i, "MTR")
    .replace(/^Soora Sang$/i, "Soo Ra Sang")
    .replace(/^4ps$/i, "4Ps")
    .replace(/^Bar-b-que\b/i, "Bar-B-Que");
}

function normalizeAreaDisplay(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/^Hsr$/i, "HSR").replace(/^Bkc$/i, "BKC");
}

function stripExtractionControls(value: string) {
  return value.replace(/[\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069]/g, "");
}

function normalizeDishName(value: string) {
  const cleaned = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^lal maas$/.test(cleaned)) return "lal maas";
  if (/^laal maas$/.test(cleaned)) return "lal maas";
  if (/^meetha mak+k?han$/.test(cleaned)) return "meetha makkhan";
  return cleaned;
}

function normalizeNoteQuality(note: string | null | undefined, restaurant: string, snippet: string) {
  const cleaned = truncate(note ?? "", 220);
  if (!cleaned || isWeakDescriptor(cleaned, restaurant, snippet)) {
    return {
      note: null,
      needsDescriptor: true,
      descriptorReason: descriptorReason(cleaned, restaurant),
      descriptorSource: "google_places_needed" as const,
    };
  }
  return {
    note: cleaned,
    needsDescriptor: false,
    descriptorReason: null,
    descriptorSource: "community_note" as const,
  };
}

function cleanDescriptorNote(note: string | null | undefined) {
  return (note ?? "")
    .replace(/\s+\bThe story\b[\s\S]*$/i, "")
    .trim();
}

function isWeakDescriptor(note: string, restaurant: string, snippet: string) {
  const normalizedNote = normalizeLoose(note);
  const normalizedRestaurant = normalizeLoose(restaurant);
  const normalizedSnippet = normalizeLoose(snippet);
  if (!normalizedNote) return true;
  if (normalizedNote === normalizedRestaurant || normalizedNote === normalizedSnippet) return true;
  if (isDishOrIngredientCandidate(note, note)) return true;
  if (/^[a-z ]{2,30}$/i.test(note) && !/\b(good|great|best|must|love|awesome|delicious|really|worth|miss|favourite|favorite)\b/i.test(note)) {
    return true;
  }
  return false;
}

function descriptorReason(note: string, restaurant: string) {
  if (!note) return "missing_note";
  if (normalizeLoose(note) === normalizeLoose(restaurant)) return "note_is_restaurant_name";
  if (isDishOrIngredientCandidate(note, note)) return "note_is_dish_or_ingredient";
  return "weak_or_bare_list_descriptor";
}

function normalizeLoose(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferArea(text: string) {
  for (const area of areaAliases.keys()) {
    if (new RegExp(`\\b${escapeRegExp(area)}\\b`, "i").test(text)) return titleCase(area);
  }
  return null;
}

function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.85) return "likely_importable";
  if (confidence >= 0.65) return "review_required";
  return "rejected";
}

function countMatches(text: string, pattern: RegExp) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return (text.match(new RegExp(pattern.source, flags)) ?? []).length;
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, raw) => {
    const value = raw.trim();
    if (!value) return counts;
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function threadText(messages: WhatsAppMessage[]) {
  return messages.map((message) => message.body).join("\n");
}

function toReviewCsv(candidates: ReviewCandidate[]) {
  const headers = [
    "reviewStatus",
    "promotionReason",
    "confidence",
    "confidenceBand",
    "city",
    "restaurant",
    "area",
    "dishes",
    "tags",
    "sourceName",
    "sourceDate",
    "evidenceLines",
    "snippet",
    "note",
    "displayNote",
    "recommendationContext",
    "contextEvidenceLines",
    "needsDescriptor",
    "descriptorReason",
    "descriptorSource",
    "threadId",
    "extractionMethod",
    "anchorType",
    "anchorConfidence",
    "anchorReason",
    "anchorText",
    "anchorSender",
    "anchorLines",
    "candidateLines",
    "requestId",
    "requestStatus",
    "contextSource",
    "contextLines",
    "supportingLines",
  ];
  const rows = candidates.map((candidate) =>
    [
      candidate.reviewStatus,
      candidate.promotionReason,
      candidate.confidence,
      candidate.confidenceBand,
      candidate.city,
      candidate.restaurant,
      candidate.area,
      candidate.dishes?.join("; "),
      candidate.tags?.join("; "),
      candidate.sourceName,
      candidate.sourceDate,
      candidate.evidenceLines,
      candidate.snippet,
      candidate.note,
      candidate.displayNote,
      candidate.recommendationContext,
      candidate.contextEvidenceLines?.join("; "),
      candidate.needsDescriptor,
      candidate.descriptorReason,
      candidate.descriptorSource,
      candidate.threadId,
      candidate.extractionMethod,
      candidate.anchorType,
      candidate.anchorConfidence,
      candidate.anchorReason,
      candidate.anchorText,
      candidate.anchorSender,
      candidate.anchorLines,
      candidate.candidateLines,
      candidate.requestId,
      candidate.requestStatus,
      candidate.contextSource,
      candidate.contextLines,
      candidate.supportingLines?.join("; "),
    ].map(csvCell),
  );
  return `${headers.join(",")}\n${rows.map((row) => row.join(",")).join("\n")}\n`;
}

async function loadCheckpoint(path: string | undefined, inputHash: string): Promise<ExtractionCheckpoint | null> {
  if (!path) return null;
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as ExtractionCheckpoint;
    return parsed.inputHash === inputHash && parsed.anchorVersion === ANCHOR_VERSION && parsed.promptVersion === PROMPT_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

async function saveCheckpoint(
  path: string | undefined,
  inputHash: string,
  runId: string,
  threads: ThreadCheckpoint[],
) {
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  await writeJson(path, { inputHash, runId, anchorVersion: ANCHOR_VERSION, promptVersion: PROMPT_VERSION, threads });
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function cleanList(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function cleanListPreserveCase(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map((item) => item.trim()).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

function truncate(value: string, length = 180) {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

function sentence(value: string) {
  return truncate(value, 220);
}

function extractJson(raw: string) {
  const trimmed = raw.trim().replace(/[\s\S]*?<\/think>/gi, "");
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const jsonStart = trimmed.indexOf("{");
  return jsonStart > 0 ? trimmed.slice(jsonStart).trim() : trimmed;
}

function writeJson(path: string, value: unknown) {
  return writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createRunId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
