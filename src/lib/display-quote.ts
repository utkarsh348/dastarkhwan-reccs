import { extractMultiPlaceAssignments, normalizePlaceName, placeKey } from "./importer/multi-place";
import type { Recommendation } from "./types";

const EMOTION_SIGNALS =
  /\b(love|loved|must|best|awesome|amazing|delicious|pretty|beautiful|favourite|favorite|recommend|try|tried|craving|yum|yummy|heat|kickass|wonderful|great|good|go for|don't miss|do not miss|MUST)\b/i;

const LIST_ONLY = /^\d+\.\s*.+$/;
const LABEL_ONLY = /^[\w\s/&'-]+:\s*$/i;

export function getDisplayQuote(recommendation: Pick<Recommendation, "restaurant" | "note" | "snippet">): string | null {
  const candidates = [
    { text: scopeNoteToRestaurant(recommendation.note, recommendation.restaurant), source: "note" as const },
    { text: scopeNoteToRestaurant(recommendation.snippet, recommendation.restaurant), source: "snippet" as const },
  ].filter((item) => item.text?.trim());

  const ranked = candidates
    .map((item) => ({ ...item, text: item.text!.trim() }))
    .filter((item) => isEmotionalQuote(item.text, recommendation.restaurant))
    .sort((left, right) => compareQuoteCandidates(left, right, recommendation.restaurant));

  return ranked[0]?.text ?? null;
}

export function isEmotionalQuote(text: string, restaurant: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;

  if (isMostlyRestaurantName(trimmed, restaurant)) return false;
  if (LIST_ONLY.test(trimmed)) return false;
  if (LABEL_ONLY.test(trimmed)) return false;
  if (/^[\w\s/&'.-]+$/i.test(trimmed) && trimmed.length < 40 && !EMOTION_SIGNALS.test(trimmed)) {
    return false;
  }

  if (EMOTION_SIGNALS.test(trimmed)) return true;

  const hasVerb = /\b(is|are|was|were|go|try|eat|love|must|recommend|need|want|don't|do)\b/i.test(trimmed);
  return words.length >= 7 && hasVerb;
}

function compareQuoteCandidates(
  left: { text: string; source: "note" | "snippet" },
  right: { text: string; source: "note" | "snippet" },
  restaurant: string,
) {
  const scoreDiff = scoreQuote(right.text, restaurant) - scoreQuote(left.text, restaurant);
  if (scoreDiff !== 0) return scoreDiff;
  const lengthDiff = right.text.length - left.text.length;
  if (lengthDiff !== 0) return lengthDiff;
  if (left.source === "note" && right.source === "snippet") return -1;
  if (left.source === "snippet" && right.source === "note") return 1;
  return 0;
}

function scoreQuote(text: string, restaurant: string) {
  let score = 0;
  if (EMOTION_SIGNALS.test(text)) score += 2;
  if (text.length >= 40) score += 1;
  if (!isMostlyRestaurantName(text, restaurant)) score += 1;
  if (text.includes("!") || text.includes("😍") || text.includes("🥹")) score += 0.5;
  return score;
}

function isMostlyRestaurantName(text: string, restaurant: string) {
  const normalizedText = normalize(text);
  const normalizedRestaurant = normalize(restaurant);
  if (!normalizedRestaurant) return false;
  if (normalizedText === normalizedRestaurant) return true;

  const stripped = normalizedText
    .replace(normalizedRestaurant, "")
    .replace(/^\d+\.\s*/, "")
    .replace(/[()]/g, "")
    .trim();

  return stripped.length < 12;
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scopeNoteToRestaurant(note: string | null | undefined, restaurant: string): string | null {
  if (!note?.trim()) return null;
  const assignments = extractMultiPlaceAssignments(note);
  if (!assignments) return note.trim();

  const targetKey = placeKey(normalizePlaceName(restaurant));
  for (const [place, scopedNote] of assignments) {
    if (placeKey(place) === targetKey) return scopedNote;
  }

  return note.trim();
}
