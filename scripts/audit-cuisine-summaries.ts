import { loadEnvConfig } from "@next/env";
import { auditCuisineSummary, repairCuisineSummary } from "../src/lib/cuisine-summary";
import { getEnv } from "../src/lib/env";
import { fetchPlaceMetadata } from "../src/lib/place-metadata";
import { mapRecommendationRow } from "../src/lib/recommendations";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../src/lib/supabase/admin";

loadEnvConfig(process.cwd());

async function main() {
  const apiKey = getEnv("GOOGLE_MAPS_SERVER_KEY");
  if (!apiKey) throw new Error("GOOGLE_MAPS_SERVER_KEY must be configured.");
  if (!isSupabaseAdminConfigured()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be configured.");
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("recommendations").select("*").order("restaurant");
  if (error) throw error;

  let fixed = 0;
  for (const row of data ?? []) {
    const recommendation = mapRecommendationRow(row);
    const issues = auditCuisineSummary({
      cuisineSummary: recommendation.cuisineSummary,
      note: recommendation.note,
      snippet: recommendation.snippet,
    });

    if (!recommendation.googlePlaceId) {
      if (issues.length) {
        console.log(
          `${recommendation.restaurant}: skipped (no place id) — ${issues.map((issue) => issue.code).join(", ")}`,
        );
      }
      continue;
    }

    const metadata = await fetchPlaceMetadata(recommendation.googlePlaceId, { apiKey });
    if (!metadata) continue;

    const repaired = repairCuisineSummary(recommendation.cuisineSummary, metadata, {
      note: recommendation.note,
      snippet: recommendation.snippet,
    });

    const needsUpdate = recommendation.cuisineSummary !== repaired;
    if (!needsUpdate) continue;

    const { error: updateError } = await admin
      .from("recommendations")
      .update({
        cuisine_summary: repaired,
        updated_by: "cuisine-audit",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recommendation.id);
    if (updateError) throw updateError;

    fixed += 1;
    console.log(
      `${recommendation.restaurant}: ${recommendation.cuisineSummary ?? "(none)"} -> ${repaired ?? "(none)"} [${issues.map((issue) => issue.code).join(", ") || "refresh"}]`,
    );
  }

  console.log(`Updated ${fixed} cuisine summaries.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
