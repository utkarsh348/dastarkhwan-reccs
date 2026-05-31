import { slugify, stableHash } from "../slug";
import type { ExtractedRecommendationCandidate } from "./schemas";

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function restaurantDedupeKey(restaurant: string, city: string): string {
  const normalizedRestaurant = /moon\s*light|moonlight/i.test(restaurant) ? "moonlight" : slugify(restaurant);
  return `${normalizedRestaurant}:${slugify(city)}`;
}

export function dedupeCandidates(
  candidates: ExtractedRecommendationCandidate[],
): ExtractedRecommendationCandidate[] {
  const merged = new Map<string, ExtractedRecommendationCandidate>();

  for (const candidate of candidates) {
    const key = restaurantDedupeKey(candidate.restaurant, candidate.city);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, candidate);
      continue;
    }

    existing.dishes = unique([...existing.dishes, ...candidate.dishes]);
    existing.tags = unique([...existing.tags, ...candidate.tags]);
    existing.address = existing.address ?? candidate.address;
    existing.area = existing.area ?? candidate.area;
    existing.googleMapsUrl = existing.googleMapsUrl ?? candidate.googleMapsUrl;
    existing.note = existing.note ?? candidate.note;
    if (candidate.snippet.length > existing.snippet.length) existing.snippet = candidate.snippet;
    existing.confidence = Math.max(existing.confidence, candidate.confidence);
    existing.sourceHash = stableHash([
      existing.restaurantSlug,
      existing.citySlug,
      existing.sourceName,
      existing.snippet,
      existing.sourceDate,
    ]);
  }

  return [...merged.values()];
}
