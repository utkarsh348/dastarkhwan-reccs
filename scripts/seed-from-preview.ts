import { readFileSync } from "fs";
import { join } from "path";
import { slugify } from "../src/lib/slug";

type PreviewRec = {
  restaurant: string;
  city: string;
  area: string | null;
  address: string | null;
  dishes: string[];
  tags: string[];
  note: string | null;
  snippet: string | null;
  sourceName: string | null;
  confidence: number;
  googleMapsUrl: string | null;
  sourceHash: string;
  sourceType: string;
  sourceDate: string | null;
  rawRefLabel: string | null;
  createdBy: string;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
  locationStatus: string;
  locationConfidence: number;
};

type PreviewFile = {
  inputName: string;
  inputHash: string;
  model: string;
  parsedMessageCount: number;
  recommendations: PreviewRec[];
};

function sqlString(value: string | null | undefined): string {
  if (value == null) return "null";
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlArray(values: string[]): string {
  if (!values.length) return "array[]::text[]";
  return `array[${values.map((v) => sqlString(v)).join(", ")}]::text[]`;
}

function buildRecStatement(rec: PreviewRec): string {
  const restaurantSlug = slugify(rec.restaurant);
  const citySlug = slugify(rec.city);
  return `
do $$
begin
  if not exists (select 1 from recommendation_sources where source_hash = ${sqlString(rec.sourceHash)}) then
    insert into recommendations (
      restaurant, restaurant_slug, city, city_slug, area, address,
      latitude, longitude, google_place_id, google_maps_url,
      location_status, location_confidence, dishes, tags, note, snippet,
      source_name, confidence, created_by
    ) values (
      ${sqlString(rec.restaurant)}, ${sqlString(restaurantSlug)}, ${sqlString(rec.city)}, ${sqlString(citySlug)},
      ${sqlString(rec.area)}, ${sqlString(rec.address)},
      ${rec.latitude ?? "null"}, ${rec.longitude ?? "null"},
      ${sqlString(rec.googlePlaceId)}, ${sqlString(rec.googleMapsUrl)},
      ${sqlString(rec.locationStatus)}, ${rec.locationConfidence},
      ${sqlArray(rec.dishes)}, ${sqlArray(rec.tags)},
      ${sqlString(rec.note)}, ${sqlString(rec.snippet)},
      ${sqlString(rec.sourceName)}, ${rec.confidence}, ${sqlString(rec.createdBy)}
    );
    insert into recommendation_sources (recommendation_id, source_type, source_hash, source_date, raw_ref_label)
    select id, ${sqlString(rec.sourceType)}, ${sqlString(rec.sourceHash)}, ${rec.sourceDate ? sqlString(rec.sourceDate) : "null"}, ${sqlString(rec.rawRefLabel)}
    from recommendations
    where restaurant_slug = ${sqlString(restaurantSlug)} and city_slug = ${sqlString(citySlug)}
    order by created_at desc
    limit 1;
  end if;
end $$;`;
}

function buildBatch(file: PreviewFile): string {
  return `insert into import_batches (input_name, input_hash, model, status, parsed_message_count, candidate_count, inserted_count, merged_count)
    values (${sqlString(file.inputName)}, ${sqlString(file.inputHash)}, ${sqlString(file.model)}, 'imported', ${file.parsedMessageCount}, ${file.recommendations.length}, ${file.recommendations.length}, 0)
    on conflict (input_hash) do nothing;`;
}

function loadPreview(name: string): PreviewFile {
  return JSON.parse(readFileSync(join(process.cwd(), "data", name), "utf8")) as PreviewFile;
}

const statements: string[] = [];
for (const fileName of ["import-preview.json", "snippets.preview.json"]) {
  const file = loadPreview(fileName);
  statements.push(buildBatch(file));
  for (const rec of file.recommendations) statements.push(buildRecStatement(rec));
}

console.log(statements.join("\n"));
