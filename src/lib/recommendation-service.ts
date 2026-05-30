import { slugify } from "./slug";
import type { Recommendation, RecommendationInput } from "./types";

export type ImportStore = {
  findRecommendationIdBySourceHash(sourceHash: string): Promise<string | null>;
  createRecommendation(input: RecommendationInput): Promise<Recommendation>;
  mergeRecommendation(id: string, input: RecommendationInput): Promise<Recommendation>;
};

export type ImportResult = {
  inserted: number;
  merged: number;
};

export async function importRecommendations(
  store: ImportStore,
  recommendations: RecommendationInput[],
): Promise<ImportResult> {
  let inserted = 0;
  let merged = 0;

  for (const input of recommendations) {
    const prepared = prepareRecommendationInput(input);
    const existingId = prepared.sourceHash
      ? await store.findRecommendationIdBySourceHash(prepared.sourceHash)
      : null;

    if (existingId) {
      await store.mergeRecommendation(existingId, prepared);
      merged += 1;
    } else {
      await store.createRecommendation(prepared);
      inserted += 1;
    }
  }

  return { inserted, merged };
}

export function prepareRecommendationInput(input: RecommendationInput): RecommendationInput {
  const city = input.city?.trim() || "Unsorted";
  return {
    ...input,
    restaurant: input.restaurant.trim(),
    city,
    locationStatus: input.locationStatus ?? "needs_lookup",
    locationConfidence: input.locationConfidence ?? 0,
    confidence: input.confidence ?? 0.5,
    createdBy: input.createdBy ?? "importer",
    dishes: unique(input.dishes ?? []),
    tags: unique(input.tags ?? []),
    restaurantSlug: undefined,
    citySlug: undefined,
  } as RecommendationInput & { restaurantSlug?: never; citySlug?: never };
}

export function recommendationSlugs(input: RecommendationInput) {
  return {
    restaurantSlug: slugify(input.restaurant),
    citySlug: slugify(input.city || "Unsorted"),
  };
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
