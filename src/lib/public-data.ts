import { isSupabaseConfigured } from "./env";
import {
  getMapRecommendations,
  getRecommendation,
  listRecommendations,
  type RecommendationListResult,
} from "./recommendations";
import type { Recommendation } from "./types";

export type PublicData<T> = {
  data: T;
  error: string | null;
};

export async function safeListRecommendations(query = {}): Promise<PublicData<RecommendationListResult>> {
  if (!isSupabaseConfigured()) {
    return { data: { recommendations: [], cities: [] }, error: "Supabase is not configured yet." };
  }

  try {
    return { data: await listRecommendations(query), error: null };
  } catch (error) {
    return { data: { recommendations: [], cities: [] }, error: errorMessage(error) };
  }
}

export async function safeGetRecommendation(id: string): Promise<PublicData<Recommendation | null>> {
  if (!isSupabaseConfigured()) return { data: null, error: "Supabase is not configured yet." };
  try {
    return { data: await getRecommendation(id), error: null };
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
}

export async function safeGetMapRecommendations(citySlug: string): Promise<PublicData<Recommendation[]>> {
  if (!isSupabaseConfigured()) return { data: [], error: "Supabase is not configured yet." };
  try {
    return { data: await getMapRecommendations(citySlug), error: null };
  } catch (error) {
    return { data: [], error: errorMessage(error) };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
