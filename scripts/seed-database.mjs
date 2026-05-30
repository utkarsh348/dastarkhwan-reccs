import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function load(name) {
  return JSON.parse(readFileSync(join(process.cwd(), "data", name), "utf8"));
}

function slugify(value) {
  const normalized = (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unsorted";
}

async function upsertBatch(file) {
  await supabase.from("import_batches").upsert(
    {
      input_name: file.inputName,
      input_hash: file.inputHash,
      model: file.model,
      status: "imported",
      parsed_message_count: file.parsedMessageCount,
      candidate_count: file.recommendations.length,
      inserted_count: file.recommendations.length,
      merged_count: 0,
    },
    { onConflict: "input_hash" },
  );
}

async function upsertRec(rec) {
  const { data: existing } = await supabase
    .from("recommendation_sources")
    .select("recommendation_id")
    .eq("source_hash", rec.sourceHash)
    .maybeSingle();

  const row = {
    restaurant: rec.restaurant,
    restaurant_slug: slugify(rec.restaurant),
    city: rec.city,
    city_slug: slugify(rec.city),
    area: rec.area,
    address: rec.address,
    latitude: rec.latitude,
    longitude: rec.longitude,
    google_place_id: rec.googlePlaceId,
    google_maps_url: rec.googleMapsUrl,
    location_status: rec.locationStatus,
    location_confidence: rec.locationConfidence,
    dishes: rec.dishes ?? [],
    tags: rec.tags ?? [],
    note: rec.note,
    snippet: rec.snippet,
    source_name: rec.sourceName,
    confidence: rec.confidence,
    created_by: rec.createdBy ?? "importer",
  };

  if (existing?.recommendation_id) {
    await supabase.from("recommendations").update(row).eq("id", existing.recommendation_id);
    return;
  }

  const { data: inserted, error } = await supabase.from("recommendations").insert(row).select("id").single();
  if (error) throw error;

  await supabase.from("recommendation_sources").insert({
    recommendation_id: inserted.id,
    source_type: rec.sourceType,
    source_hash: rec.sourceHash,
    source_date: rec.sourceDate,
    raw_ref_label: rec.rawRefLabel,
  });
}

async function main() {
  for (const fileName of ["import-preview.json", "snippets.preview.json"]) {
    const file = load(fileName);
    await upsertBatch(file);
    for (const rec of file.recommendations) {
      await upsertRec(rec);
    }
    console.log(`Seeded ${file.recommendations.length} from ${fileName}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
