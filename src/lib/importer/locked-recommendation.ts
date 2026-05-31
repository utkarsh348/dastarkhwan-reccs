import type { ExtractedRecommendationCandidate } from "./schemas";

/** Minimum LLM confidence for a session-extracted row to count as "locked". */
export const LOCKED_CONFIDENCE_THRESHOLD = 0.5;

type LockableRow = Pick<
  ExtractedRecommendationCandidate,
  "restaurant" | "city" | "note" | "snippet" | "confidence" | "sourceName" | "sessionId"
> & {
  rawRefLabel?: string | null;
};

/** Session-backed recommendation with name, city, voice, contributor, and confidence. */
export function isLockedRecommendation(candidate: LockableRow): boolean {
  const restaurant = candidate.restaurant?.trim();
  const city = candidate.city?.trim();
  const sourceName = candidate.sourceName?.trim();
  const sessionId = candidate.sessionId?.trim() || extractSessionIdFromRawRef(candidate.rawRefLabel);
  const hasVoice = Boolean(candidate.note?.trim() || candidate.snippet?.trim());
  const confidence = candidate.confidence ?? 0;

  return (
    Boolean(restaurant && restaurant.length >= 2) &&
    Boolean(city) &&
    Boolean(sourceName) &&
    Boolean(sessionId) &&
    hasVoice &&
    confidence >= LOCKED_CONFIDENCE_THRESHOLD
  );
}

function extractSessionIdFromRawRef(rawRefLabel?: string | null): string | null {
  if (!rawRefLabel) return null;
  const match = rawRefLabel.match(/^session\s+(\S+)/i);
  return match?.[1] ?? null;
}
