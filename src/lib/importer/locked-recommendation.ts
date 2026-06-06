import type { ExtractedRecommendationCandidate } from "./schemas";

/** Minimum extraction confidence for a row to count as "locked". */
export const LOCKED_CONFIDENCE_THRESHOLD = 0.5;

type LockableRow = Pick<ExtractedRecommendationCandidate, "restaurant"> & {
  confidence?: number;
  city?: string;
  sourceName?: string | null;
  note?: string | null;
  snippet?: string | null;
  threadId?: string;
  sessionId?: string;
  rawRefLabel?: string | null;
};

/** Recommendation with name, city, voice, contributor, provenance, and confidence. */
export function isLockedRecommendation(candidate: LockableRow): boolean {
  const restaurant = candidate.restaurant?.trim();
  const city = candidate.city?.trim();
  const sourceName = candidate.sourceName?.trim();
  const provenanceId =
    candidate.threadId?.trim() ||
    candidate.sessionId?.trim() ||
    extractProvenanceIdFromRawRef(candidate.rawRefLabel);
  const hasVoice = Boolean(candidate.note?.trim() || candidate.snippet?.trim());
  const confidence = candidate.confidence ?? 0;

  return (
    Boolean(restaurant && restaurant.length >= 2) &&
    Boolean(city) &&
    Boolean(sourceName) &&
    Boolean(provenanceId) &&
    hasVoice &&
    confidence >= LOCKED_CONFIDENCE_THRESHOLD
  );
}

function extractProvenanceIdFromRawRef(rawRefLabel?: string | null): string | null {
  if (!rawRefLabel) return null;
  const match = rawRefLabel.match(/^(?:thread|session)\s+(\S+)/i);
  return match?.[1] ?? null;
}
