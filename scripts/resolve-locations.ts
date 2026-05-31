import { loadEnvConfig } from "@next/env";
import { getEnv } from "../src/lib/env";
import { resolveLocation } from "../src/lib/geocode";
import { resetGeocodeCache } from "../src/lib/geocode";
import {
  logGoogleMapsBudgetSummary,
  resetGoogleMapsRequestCount,
} from "../src/lib/google-maps-budget";
import { resetPlaceMetadataCache } from "../src/lib/place-metadata";
import {
  getPendingLocationRecommendations,
  mapRecommendationRow,
  updateRecommendation,
} from "../src/lib/recommendations";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../src/lib/supabase/admin";

loadEnvConfig(process.cwd());

async function main() {
  resetGoogleMapsRequestCount();
  resetGeocodeCache();
  resetPlaceMetadataCache();

  const apiKey = getEnv("GOOGLE_MAPS_SERVER_KEY");
  if (!apiKey) throw new Error("GOOGLE_MAPS_SERVER_KEY must be configured.");
  if (!isSupabaseAdminConfigured()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be configured for bulk resolve.");
  }

  const admin = getSupabaseAdminClient();
  let totalResolved = 0;
  let totalFailed = 0;
  let rounds = 0;

  while (rounds < 20) {
    const pending = await getPendingLocationRecommendations(100);
    if (!pending.length) break;

    for (const recommendation of pending) {
      const location = await resolveLocation(recommendation, { apiKey });
      const hasCoords =
        typeof location.latitude === "number" && typeof location.longitude === "number";

      await updateRecommendation(
        recommendation.id,
        {
          ...recommendation,
          ...location,
          updatedBy: "location-resolver",
        },
        admin,
      );

      if (hasCoords) totalResolved += 1;
      else totalFailed += 1;
    }

    rounds += 1;
  }

  const { data: rows, error } = await admin.from("recommendations").select("city_slug, latitude, longitude");
  if (error) throw error;

  const summary = new Map<string, { total: number; mapped: number }>();
  for (const row of rows ?? []) {
    const rec = mapRecommendationRow(row);
    const current = summary.get(rec.citySlug) ?? { total: 0, mapped: 0 };
    current.total += 1;
    if (typeof rec.latitude === "number" && typeof rec.longitude === "number") {
      current.mapped += 1;
    }
    summary.set(rec.citySlug, current);
  }

  console.log(`Resolved with coordinates: ${totalResolved}`);
  console.log(`Still without coordinates: ${totalFailed}`);
  console.log("Coverage by city:");
  for (const [citySlug, stats] of [...summary.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${citySlug}: ${stats.mapped}/${stats.total} on map`);
  }

  logGoogleMapsBudgetSummary();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
