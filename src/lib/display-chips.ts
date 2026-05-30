import { filterStrongLabels } from "./weak-content";
import type { Recommendation } from "./types";

export function getDisplayChips(
  recommendation: Pick<Recommendation, "restaurant" | "dishes" | "tags">,
): string[] {
  const fromDishes = filterStrongLabels(recommendation.dishes, recommendation.restaurant);
  if (fromDishes.length) return fromDishes.slice(0, 4);

  const fromTags = filterStrongLabels(recommendation.tags, recommendation.restaurant);
  return fromTags.slice(0, 4);
}
