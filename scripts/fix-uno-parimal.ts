import { loadEnvConfig } from "@next/env";
import { getEnv } from "../src/lib/env";
import { resolveLocation } from "../src/lib/geocode";
import { extractMultiPlaceAssignments } from "../src/lib/importer/multi-place";
import { mapRecommendationRow } from "../src/lib/recommendations";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../src/lib/supabase/admin";

loadEnvConfig(process.cwd());

const COMBINED_NOTE =
  "Also there is this classic calzone place called UNO Pizza. I loved it when I used to go as a college student. For morning breakfast differnt kinds of poha is a thing. For best experience go early morning to Parimal Garde";

async function main() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be configured.");
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("recommendations")
    .select("*")
    .eq("restaurant_slug", "uno-pizza")
    .eq("city_slug", "ahmedabad")
    .limit(1);
  if (error) throw error;

  const row = data?.[0];
  if (!row) {
    console.log("No UNO Pizza row found in Ahmedabad.");
    return;
  }

  const assignments = extractMultiPlaceAssignments(COMBINED_NOTE);
  if (!assignments) throw new Error("Could not split combined UNO / Parimal note.");

  const unoNote = assignments.get("UNO Pizza");
  const parimalNote = assignments.get("Parimal Garden");
  if (!unoNote || !parimalNote) throw new Error("Missing split notes for UNO or Parimal Garden.");

  const recommendation = mapRecommendationRow(row);
  const apiKey = getEnv("GOOGLE_MAPS_SERVER_KEY");

  const { error: unoError } = await admin
    .from("recommendations")
    .update({
      note: unoNote,
      snippet: unoNote,
      dishes: ["calzone", "pizza"],
      tags: ["pizza", "nostalgia"],
      updated_by: "split-fix",
      updated_at: new Date().toISOString(),
    })
    .eq("id", recommendation.id);
  if (unoError) throw unoError;
  console.log(`Updated UNO Pizza: ${unoNote}`);

  const { data: existingParimal } = await admin
    .from("recommendations")
    .select("id")
    .eq("restaurant_slug", "parimal-garden")
    .eq("city_slug", "ahmedabad")
    .maybeSingle();

  const parimalBase = {
    restaurant: "Parimal Garden",
    city: "Ahmedabad",
    area: null as string | null,
    address: null as string | null,
    dishes: ["poha"],
    tags: ["breakfast"],
    note: parimalNote,
    snippet: parimalNote,
    source_name: recommendation.sourceName,
    confidence: 0.82,
    created_by: "split-fix",
    location_status: "needs_lookup",
    location_confidence: 0,
    google_maps_url: null as string | null,
    google_place_id: null as string | null,
    latitude: null as number | null,
    longitude: null as number | null,
  };

  if (apiKey) {
    const resolved = await resolveLocation(
      {
        restaurant: parimalBase.restaurant,
        city: parimalBase.city,
        area: parimalBase.area,
        address: parimalBase.address,
      },
      { apiKey },
    );
    Object.assign(parimalBase, {
      address: resolved.address ?? parimalBase.address,
      google_maps_url: resolved.googleMapsUrl ?? null,
      google_place_id: resolved.googlePlaceId ?? null,
      latitude: resolved.latitude ?? null,
      longitude: resolved.longitude ?? null,
      location_status: resolved.locationStatus,
      location_confidence: resolved.locationConfidence,
    });
  }

  if (existingParimal?.id) {
    const { error: parimalUpdateError } = await admin
      .from("recommendations")
      .update({
        ...parimalBase,
        updated_by: "split-fix",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingParimal.id);
    if (parimalUpdateError) throw parimalUpdateError;
    console.log(`Updated Parimal Garden: ${parimalNote}`);
    return;
  }

  const { data: inserted, error: insertError } = await admin
    .from("recommendations")
    .insert({
      ...parimalBase,
      restaurant_slug: "parimal-garden",
      city_slug: "ahmedabad",
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  await admin.from("recommendation_sources").insert({
    recommendation_id: inserted.id,
    source_type: "whatsapp_zip",
    source_hash: `${recommendation.id}-parimal-split`,
    source_date: row.created_at,
    raw_ref_label: "split from uno-pizza combined note",
  });

  console.log(`Inserted Parimal Garden: ${parimalNote}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
