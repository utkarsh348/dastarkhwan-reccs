import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichWithLocation } from "./enrich-location";
import { getSupabaseServerClient } from "./supabase-server";
import { buildGoogleMapsSearchUrl, normalizeLocationStatus } from "./location";
import { recommendationSlugs } from "./recommendation-service";
import type { CitySummary, Recommendation, RecommendationInput } from "./types";

type RecommendationRow = Record<string, unknown>;

export type RecommendationListResult = {
  recommendations: Recommendation[];
  cities: CitySummary[];
};

export type RecommendationQuery = {
  city?: string | null;
  q?: string | null;
  withLocation?: boolean;
  locationStatus?: string | null;
  limit?: number;
  offset?: number;
};

function clientForRead(client?: SupabaseClient) {
  return client ?? getSupabaseServerClient();
}

export async function listRecommendations(
  query: RecommendationQuery = {},
  client?: SupabaseClient,
): Promise<RecommendationListResult> {
  const supabase = clientForRead(client);
  const limit = Math.min(query.limit ?? 200, 500);
  const offset = query.offset ?? 0;

  let request = supabase
    .from("recommendations")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (query.city) request = request.eq("city_slug", query.city);
  if (query.withLocation) request = request.not("latitude", "is", null).not("longitude", "is", null);
  if (query.locationStatus) request = request.eq("location_status", query.locationStatus);
  if (query.q) {
    const term = `%${query.q}%`;
    request = request.or(
      `restaurant.ilike.${term},city.ilike.${term},area.ilike.${term},note.ilike.${term},snippet.ilike.${term}`,
    );
  }

  const [{ data, error }, cityResult] = await Promise.all([
    request,
    supabase.from("recommendations").select("city, city_slug, latitude, longitude"),
  ]);

  if (error) throw error;
  if (cityResult.error) throw cityResult.error;

  const recommendations = (data ?? []).map(mapRecommendationRow);
  const cities = summarizeCities((cityResult.data ?? []).map(mapRecommendationRow));
  return { recommendations, cities };
}

export async function getRecommendation(id: string, client?: SupabaseClient): Promise<Recommendation | null> {
  const supabase = clientForRead(client);
  const { data, error } = await supabase.from("recommendations").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapRecommendationRow(data) : null;
}

export async function createRecommendation(
  input: RecommendationInput,
  client?: SupabaseClient,
): Promise<Recommendation> {
  const supabase = client ?? getSupabaseServerClient();
  const enriched = await enrichWithLocation(input);
  const payload = toRecommendationInsert(enriched);
  const { data, error } = await supabase.from("recommendations").insert(payload).select("*").single();
  if (error) throw error;
  const recommendation = mapRecommendationRow(data);

  if (input.sourceHash) {
    await supabase.from("recommendation_sources").insert({
      recommendation_id: recommendation.id,
      source_type: input.sourceType ?? "manual",
      source_hash: input.sourceHash,
      source_date: input.sourceDate,
      raw_ref_label: input.rawRefLabel,
    });
  }

  await supabase.from("edit_events").insert({
    recommendation_id: recommendation.id,
    editor_name: input.createdBy ?? "importer",
    action: "create",
    after_summary: recommendation,
  });

  return recommendation;
}

export async function updateRecommendation(
  id: string,
  input: RecommendationInput,
  client?: SupabaseClient,
): Promise<Recommendation> {
  const supabase = client ?? getSupabaseServerClient();
  const before = await getRecommendation(id, clientForRead(client));
  const enriched = await enrichWithLocation(input);
  const { data, error } = await supabase
    .from("recommendations")
    .update({ ...toRecommendationUpdate(enriched), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  const after = mapRecommendationRow(data);

  await supabase.from("edit_events").insert({
    recommendation_id: id,
    editor_name: input.updatedBy ?? input.createdBy ?? "unknown",
    action: "update",
    before_summary: before,
    after_summary: after,
  });

  return after;
}

export async function findRecommendationIdBySourceHash(sourceHash: string): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("recommendation_sources")
    .select("recommendation_id")
    .eq("source_hash", sourceHash)
    .maybeSingle();
  if (error) throw error;
  return (data?.recommendation_id as string | undefined) ?? null;
}

export async function mergeRecommendation(id: string, input: RecommendationInput): Promise<Recommendation> {
  const existing = await getRecommendation(id);
  if (!existing) throw new Error("Recommendation not found");

  return updateRecommendation(id, {
    ...input,
    dishes: unique([...existing.dishes, ...(input.dishes ?? [])]),
    tags: unique([...existing.tags, ...(input.tags ?? [])]),
    snippet: existing.snippet ?? input.snippet,
    note: existing.note ?? input.note,
    updatedBy: "importer",
  });
}

export async function getMapRecommendations(citySlug: string): Promise<Recommendation[]> {
  const { recommendations } = await listRecommendations({ city: citySlug, withLocation: true, limit: 500 });
  return recommendations;
}

export async function getPendingLocationRecommendations(limit = 100): Promise<Recommendation[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("recommendations")
    .select("*")
    .or("location_status.in.(needs_lookup,ambiguous),latitude.is.null,longitude.is.null")
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapRecommendationRow);
}

export function mapRecommendationRow(row: RecommendationRow): Recommendation {
  return {
    id: String(row.id),
    restaurant: String(row.restaurant),
    restaurantSlug: String(row.restaurant_slug),
    city: String(row.city),
    citySlug: String(row.city_slug),
    area: nullableString(row.area),
    address: nullableString(row.address),
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    googlePlaceId: nullableString(row.google_place_id),
    googleMapsUrl: nullableString(row.google_maps_url),
    locationStatus: normalizeLocationStatus(nullableString(row.location_status)),
    locationConfidence: Number(row.location_confidence ?? 0),
    dishes: Array.isArray(row.dishes) ? row.dishes.map(String) : [],
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    cuisineSummary: nullableString(row.cuisine_summary),
    note: nullableString(row.note),
    snippet: nullableString(row.snippet),
    sourceName: nullableString(row.source_name),
    confidence: Number(row.confidence ?? 0.5),
    createdBy: String(row.created_by ?? "importer"),
    updatedBy: nullableString(row.updated_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function toRecommendationInsert(input: RecommendationInput) {
  const slugs = recommendationSlugs(input);
  return {
    restaurant: input.restaurant,
    restaurant_slug: slugs.restaurantSlug,
    city: input.city ?? "Unsorted",
    city_slug: slugs.citySlug,
    area: input.area,
    address: input.address,
    latitude: input.latitude,
    longitude: input.longitude,
    google_place_id: input.googlePlaceId,
    google_maps_url: input.googleMapsUrl ?? buildGoogleMapsSearchUrl(input.restaurant, input.city, input.area),
    location_status: input.locationStatus ?? "needs_lookup",
    location_confidence: input.locationConfidence ?? 0,
    dishes: input.dishes ?? [],
    tags: input.tags ?? [],
    cuisine_summary: input.cuisineSummary ?? null,
    note: input.note,
    snippet: input.snippet,
    source_name: input.sourceName,
    confidence: input.confidence ?? 0.5,
    created_by: input.createdBy ?? "importer",
    updated_by: input.updatedBy,
  };
}

function toRecommendationUpdate(input: RecommendationInput) {
  const insert = toRecommendationInsert(input);
  return Object.fromEntries(Object.entries(insert).filter(([, value]) => value !== undefined));
}

function summarizeCities(recommendations: Recommendation[]): CitySummary[] {
  const cities = new Map<string, CitySummary>();
  for (const recommendation of recommendations) {
    const current =
      cities.get(recommendation.citySlug) ??
      ({
        city: recommendation.city,
        citySlug: recommendation.citySlug,
        count: 0,
        mappedCount: 0,
      } satisfies CitySummary);
    current.count += 1;
    if (typeof recommendation.latitude === "number" && typeof recommendation.longitude === "number") {
      current.mappedCount += 1;
    }
    cities.set(recommendation.citySlug, current);
  }
  return [...cities.values()].sort((left, right) => left.city.localeCompare(right.city));
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
