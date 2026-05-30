import { z } from "zod";
import { extractGoogleMapsUrls } from "../location";
import { firstName, slugify, stableHash, titleCase } from "../slug";
import { clusterMessages, type ExtractedRecommendationCandidate, type WhatsAppMessage } from "./whatsapp";

type OllamaExtractionOptions = {
  endpoint?: string;
  model?: string;
  fallbackModel?: string;
  fetcher?: typeof fetch;
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
  response?: string;
};

const extractedSchema = z.object({
  restaurant: z.string().min(1),
  city: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  dishes: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  note: z.string().optional().nullable(),
  snippet: z.string().optional().nullable(),
  sourceName: z.string().optional().nullable(),
  googleMapsUrl: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().default(0.65),
});

const payloadSchema = z.object({
  recommendations: z.array(extractedSchema).default([]),
});

export async function extractRecommendationCandidatesWithOllama(
  messages: WhatsAppMessage[],
  options: OllamaExtractionOptions = {},
): Promise<{ candidates: ExtractedRecommendationCandidate[]; model: string }> {
  const endpoint = options.endpoint ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const model = options.model ?? process.env.OLLAMA_MODEL ?? "qwen3:4b";
  const fallbackModel = options.fallbackModel ?? "llama3.2:3b";
  const fetcher = options.fetcher ?? fetch;
  const clusters = clusterMessages(messages);
  const candidates: ExtractedRecommendationCandidate[] = [];
  let usedModel = model;

  for (const cluster of clusters) {
    const response = await requestClusterExtraction(cluster, {
      endpoint,
      model: usedModel,
      fallbackModel,
      fetcher,
    });
    usedModel = response.model;
    candidates.push(...response.candidates);
  }

  return { candidates, model: usedModel };
}

async function requestClusterExtraction(
  cluster: WhatsAppMessage[],
  options: Required<Omit<OllamaExtractionOptions, "endpoint">> & { endpoint: string },
) {
  try {
    return await requestClusterWithModel(cluster, options.model, options);
  } catch (primaryError) {
    if (options.fallbackModel === options.model) throw primaryError;
    return requestClusterWithModel(cluster, options.fallbackModel, options);
  }
}

async function requestClusterWithModel(
  cluster: WhatsAppMessage[],
  model: string,
  options: Required<Omit<OllamaExtractionOptions, "endpoint">> & { endpoint: string },
) {
  const response = await options.fetcher(`${options.endpoint.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      messages: [
        {
          role: "system",
          content:
            "Extract food and restaurant recommendations from WhatsApp chat context. Return one recommendation per distinct restaurant or place; never combine multiple venues into one entry. Infer city from nearby context when safe. Return strict JSON only.",
        },
        {
          role: "user",
          content: buildPrompt(cluster),
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Ollama ${model} failed with ${response.status}`);

  const data = (await response.json()) as OllamaChatResponse;
  const raw = data.message?.content ?? data.response ?? "";
  const parsed = payloadSchema.parse(JSON.parse(extractJson(raw)));

  return {
    model,
    candidates: parsed.recommendations.map((recommendation) => candidateFromOllama(recommendation, cluster)),
  };
}

function buildPrompt(cluster: WhatsAppMessage[]) {
  const transcript = cluster
    .map(
      (message) =>
        `[${message.timestamp.toISOString()}] ${firstName(message.sender)}: ${message.body.replace(/\s+/g, " ")}`,
    )
    .join("\n");

  return `Return JSON shaped as {"recommendations":[{"restaurant":"","city":"","area":null,"address":null,"dishes":[],"tags":[],"note":"","snippet":"","sourceName":"","googleMapsUrl":null,"confidence":0.8}]}.

Rules:
- Include only actual restaurant/cafe/bakery/food stall recommendations.
- Do not include request messages or category headings as restaurants.
- If the city is implied by a nearby request, use that city.
- Use "Unsorted" when city is genuinely unknown.
- Keep snippets short and sanitized.

Transcript:
${transcript}`;
}

function candidateFromOllama(
  recommendation: z.infer<typeof extractedSchema>,
  cluster: WhatsAppMessage[],
): ExtractedRecommendationCandidate {
  const reference = findReferenceMessage(recommendation, cluster);
  const restaurant = titleCase(recommendation.restaurant);
  const city = recommendation.city ? titleCase(recommendation.city) : "Unsorted";
  const snippet = truncate(recommendation.snippet ?? reference.body);
  const restaurantSlug = slugify(restaurant);
  const citySlug = slugify(city);
  const sourceName = firstName(recommendation.sourceName ?? reference.sender);

  return {
    restaurant,
    restaurantSlug,
    city,
    citySlug,
    area: recommendation.area ? titleCase(recommendation.area) : null,
    address: recommendation.address ?? null,
    dishes: unique(recommendation.dishes.map((dish) => dish.toLowerCase())),
    tags: unique(recommendation.tags.map((tag) => tag.toLowerCase())),
    note: recommendation.note ? truncate(recommendation.note, 220) : null,
    snippet,
    sourceName,
    confidence: recommendation.confidence,
    googleMapsUrl: recommendation.googleMapsUrl ?? extractGoogleMapsUrls(reference.body)[0] ?? null,
    sourceDate: reference.timestamp.toISOString(),
    rawRefLabel: `lines ${cluster[0]?.lineStart ?? reference.lineStart}-${cluster.at(-1)?.lineEnd ?? reference.lineEnd}`,
    sourceHash: stableHash([restaurantSlug, citySlug, sourceName, snippet, reference.timestamp.toISOString()]),
  };
}

function findReferenceMessage(recommendation: z.infer<typeof extractedSchema>, cluster: WhatsAppMessage[]) {
  const snippet = recommendation.snippet?.toLowerCase();
  if (snippet) {
    const match = cluster.find((message) => message.body.toLowerCase().includes(snippet.slice(0, 48)));
    if (match) return match;
  }

  const source = recommendation.sourceName?.toLowerCase();
  if (source) {
    const match = cluster.find((message) => firstName(message.sender).toLowerCase() === firstName(source).toLowerCase());
    if (match) return match;
  }

  return cluster[0]!;
}

function extractJson(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function truncate(value: string, length = 180) {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
