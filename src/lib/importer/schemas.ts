import { z } from "zod";

export const sessionConfirmSchema = z.object({
  messageIndex: z.number().int().nonnegative(),
  isRequest: z.boolean(),
  city: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().default(0.5),
});

export const sessionConfirmBatchSchema = z.object({
  results: z.array(sessionConfirmSchema).default([]),
});

export const extractedRecommendationSchema = z.object({
  restaurant: z.string().min(1),
  city: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  dishes: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  note: z.string().optional().nullable(),
  snippet: z.string().optional().nullable(),
  sourceName: z.string().optional().nullable(),
  sourceMessageIndices: z.array(z.number().int().nonnegative()).optional().default([]),
  googleMapsUrl: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1).optional().default(0.65),
});

export const sessionExtractionSchema = z.object({
  recommendations: z.array(extractedRecommendationSchema).default([]),
});

export type SessionConfirmResult = z.infer<typeof sessionConfirmSchema>;
export type ExtractedRecommendationRaw = z.infer<typeof extractedRecommendationSchema>;

export type ReccSessionEndReason = "next_request" | "idle_gap" | "max_window" | "end_of_chat";

export type ReccSession = {
  id: string;
  city: string;
  area: string | null;
  requestMessageIndex: number;
  messageIndices: number[];
  startedAt: string;
  endedAt: string;
  endReason: ReccSessionEndReason;
};

export type SessionExtractionResult = {
  sessionId: string;
  recommendations: ExtractedRecommendationRaw[];
  model: string;
  durationMs: number;
  error?: string;
};

export type ExtractedRecommendationCandidate = {
  restaurant: string;
  restaurantSlug: string;
  city: string;
  citySlug: string;
  area: string | null;
  address: string | null;
  dishes: string[];
  tags: string[];
  note: string | null;
  snippet: string;
  sourceName: string;
  confidence: number;
  googleMapsUrl: string | null;
  sourceHash: string;
  sourceDate: string;
  rawRefLabel: string;
  sessionId?: string;
  sourceMessageIndices?: number[];
};

export type PipelineResult = {
  inputName: string;
  inputHash: string;
  model: string;
  pipelineVersion: string;
  parsedMessageCount: number;
  sessionCount: number;
  sessions: ReccSession[];
  extractions: SessionExtractionResult[];
  candidates: ExtractedRecommendationCandidate[];
};
