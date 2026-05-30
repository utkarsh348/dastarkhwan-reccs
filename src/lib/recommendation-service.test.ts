import { describe, expect, it } from "vitest";
import { ImportStore, importRecommendations } from "./recommendation-service";
import type { Recommendation, RecommendationInput } from "./types";

class MemoryImportStore implements ImportStore {
  recommendations: Recommendation[] = [];
  sources = new Map<string, string>();

  async findRecommendationIdBySourceHash(sourceHash: string) {
    return this.sources.get(sourceHash) ?? null;
  }

  async createRecommendation(input: RecommendationInput) {
    const now = new Date().toISOString();
    const recommendation: Recommendation = {
      id: `rec-${this.recommendations.length + 1}`,
      restaurant: input.restaurant,
      restaurantSlug: "ahdoos",
      city: input.city ?? "Unsorted",
      citySlug: "srinagar",
      area: input.area ?? null,
      address: input.address ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      googlePlaceId: input.googlePlaceId ?? null,
      googleMapsUrl: input.googleMapsUrl ?? null,
      locationStatus: input.locationStatus ?? "needs_lookup",
      locationConfidence: input.locationConfidence ?? 0,
      dishes: input.dishes ?? [],
      tags: input.tags ?? [],
      note: input.note ?? null,
      snippet: input.snippet ?? null,
      sourceName: input.sourceName ?? null,
      confidence: input.confidence ?? 0.5,
      createdBy: input.createdBy ?? "importer",
      updatedBy: input.updatedBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.recommendations.push(recommendation);
    if (input.sourceHash) this.sources.set(input.sourceHash, recommendation.id);
    return recommendation;
  }

  async mergeRecommendation(id: string, input: RecommendationInput) {
    const recommendation = this.recommendations.find((item) => item.id === id);
    if (!recommendation) throw new Error("missing recommendation");
    recommendation.dishes = [...new Set([...recommendation.dishes, ...(input.dishes ?? [])])];
    recommendation.tags = [...new Set([...recommendation.tags, ...(input.tags ?? [])])];
    recommendation.snippet = recommendation.snippet ?? input.snippet ?? null;
    return recommendation;
  }
}

describe("importRecommendations", () => {
  it("inserts new recommendations and merges duplicate source hashes", async () => {
    const store = new MemoryImportStore();
    const result = await importRecommendations(store, [
      {
        restaurant: "Ahdoos",
        city: "Srinagar",
        dishes: ["wazwan"],
        tags: ["restaurant"],
        sourceHash: "same-source",
      },
      {
        restaurant: "Ahdoos",
        city: "Srinagar",
        dishes: ["tabak maaz"],
        tags: ["wazwan"],
        sourceHash: "same-source",
      },
    ]);

    expect(result).toEqual({ inserted: 1, merged: 1 });
    expect(store.recommendations).toHaveLength(1);
    expect(store.recommendations[0]?.dishes).toEqual(["wazwan", "tabak maaz"]);
    expect(store.recommendations[0]?.tags).toEqual(["restaurant", "wazwan"]);
  });
});
