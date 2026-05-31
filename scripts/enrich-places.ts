import { loadEnvConfig } from "@next/env";
import { getEnv } from "../src/lib/env";
import { repairCuisineSummary } from "../src/lib/cuisine-summary";
import {
  logGoogleMapsBudgetSummary,
  resetGoogleMapsRequestCount,
} from "../src/lib/google-maps-budget";
import { fetchPlaceMetadata, resetPlaceMetadataCache } from "../src/lib/place-metadata";
import { resetGeocodeCache } from "../src/lib/geocode";
import { mapRecommendationRow } from "../src/lib/recommendations";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../src/lib/supabase/admin";
import { sanitizeRecommendationContent } from "../src/lib/weak-content";

loadEnvConfig(process.cwd());

async function main() {
  resetGoogleMapsRequestCount();
  resetGeocodeCache();
  resetPlaceMetadataCache();

  const apiKey = getEnv("GOOGLE_MAPS_SERVER_KEY");
  if (!apiKey) throw new Error("GOOGLE_MAPS_SERVER_KEY must be configured.");
  if (!isSupabaseAdminConfigured()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be configured for enrich.");
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("recommendations")
    .select("*")
    .not("google_place_id", "is", null);
  if (error) throw error;

  let enriched = 0;
  for (const row of data ?? []) {
    const recommendation = mapRecommendationRow(row);
    if (!recommendation.googlePlaceId) continue;

    const metadata = await fetchPlaceMetadata(recommendation.googlePlaceId, { apiKey });
    const cuisineSummary = metadata
      ? repairCuisineSummary(recommendation.cuisineSummary, metadata, {
          note: recommendation.note,
          snippet: recommendation.snippet,
        })
      : null;
    const sanitized = sanitizeRecommendationContent({
      ...recommendation,
      cuisineSummary,
    });

    const cuisineChanged = recommendation.cuisineSummary !== sanitized.cuisineSummary;
    const dishesChanged = JSON.stringify(recommendation.dishes) !== JSON.stringify(sanitized.dishes);
    const tagsChanged = JSON.stringify(recommendation.tags) !== JSON.stringify(sanitized.tags);
    const noteChanged = recommendation.note !== sanitized.note;
    if (!cuisineChanged && !dishesChanged && !tagsChanged && !noteChanged) continue;

    const { error: updateError } = await admin
      .from("recommendations")
      .update({
        cuisine_summary: sanitized.cuisineSummary,
        dishes: sanitized.dishes,
        tags: sanitized.tags,
        note: sanitized.note,
        updated_by: "place-enricher",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recommendation.id);
    if (updateError) throw updateError;
    enriched += 1;
    console.log(
      `Enriched ${recommendation.restaurant}: ${sanitized.cuisineSummary ?? "(no cuisine line)"}`,
    );
  }

  console.log(`Updated ${enriched} recommendations with cuisine summaries.`);
  logGoogleMapsBudgetSummary();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
