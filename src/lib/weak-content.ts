import type { Recommendation, RecommendationInput } from "./types";

const GENERIC_LABELS = new Set([
  "snacks",
  "snack",
  "restaurant",
  "food",
  "beverages",
  "beverage",
  "drinks",
  "curries",
  "curry",
  "tags",
  "dining",
  "eatery",
  "cafe",
  "shop",
]);

const WEAK_NOTE_PATTERNS = [
  /\bfancier version\b/i,
  /\bversion of the above\b/i,
  /\babove\)\s*$/i,
  /^\d+\.\s/,
];

export function isWeakLabel(label: string, restaurant: string): boolean {
  const trimmed = label.trim();
  if (!trimmed || trimmed.length < 3) return true;
  if (trimmed.length > 28) return true;
  if (GENERIC_LABELS.has(trimmed.toLowerCase())) return true;
  if (/^\d+\.\s/.test(trimmed)) return true;
  if (isMostlyRestaurantName(trimmed, restaurant)) return true;
  return false;
}

export function filterStrongLabels(labels: string[], restaurant: string): string[] {
  return labels.map((label) => label.trim()).filter((label) => label && !isWeakLabel(label, restaurant));
}

export function isWeakNote(note: string | null | undefined, restaurant: string): boolean {
  if (!note?.trim()) return false;
  const trimmed = note.trim();
  if (trimmed.length < 12) return true;
  if (isMostlyRestaurantName(trimmed, restaurant)) return true;
  if (WEAK_NOTE_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  if (!/\b(love|must|best|awesome|try|recommend|delicious|great|good|wazwan|fudge)\b/i.test(trimmed)) {
    if (trimmed.length < 40 && !trimmed.includes(",")) return true;
  }
  return false;
}

export function needsPlaceMetadata(
  input: Pick<RecommendationInput, "dishes" | "tags" | "restaurant">,
): boolean {
  const restaurant = input.restaurant ?? "";
  const strongDishes = filterStrongLabels(input.dishes ?? [], restaurant);
  const strongTags = filterStrongLabels(input.tags ?? [], restaurant);
  return strongDishes.length === 0 && strongTags.length === 0;
}

export function sanitizeRecommendationContent(input: RecommendationInput): RecommendationInput {
  const restaurant = input.restaurant;
  return {
    ...input,
    dishes: filterStrongLabels(input.dishes ?? [], restaurant),
    tags: filterStrongLabels(input.tags ?? [], restaurant),
    note: isWeakNote(input.note, restaurant) ? null : (input.note ?? null),
  };
}

/** @deprecated Use sanitizeRecommendationContent; kept for tests. */
export function mergePlaceMetadata(
  input: RecommendationInput,
  googleLabels: string[] | null,
): RecommendationInput {
  void googleLabels;
  return sanitizeRecommendationContent(input);
}

function isMostlyRestaurantName(text: string, restaurant: string) {
  const normalizedText = normalize(text);
  const normalizedRestaurant = normalize(restaurant);
  if (!normalizedRestaurant) return false;
  if (normalizedText === normalizedRestaurant) return true;
  if (!normalizedText.includes(normalizedRestaurant)) return false;

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

export function recommendationNeedsEnrichment(recommendation: Recommendation): boolean {
  const restaurant = recommendation.restaurant;
  const hasWeakDishes = (recommendation.dishes ?? []).some((dish) => isWeakLabel(dish, restaurant));
  const hasWeakTags = (recommendation.tags ?? []).some((tag) => isWeakLabel(tag, restaurant));
  return (
    Boolean(recommendation.googlePlaceId) &&
    (needsPlaceMetadata(recommendation) ||
      hasWeakDishes ||
      hasWeakTags ||
      isWeakNote(recommendation.note, restaurant))
  );
}
