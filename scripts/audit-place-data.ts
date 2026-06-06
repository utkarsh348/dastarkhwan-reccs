import { loadEnvConfig } from "@next/env";
import fs from "node:fs";
import path from "node:path";
import { auditCuisineSummary, repairCuisineSummary } from "../src/lib/cuisine-summary";
import { getEnv } from "../src/lib/env";
import { resolveLocation } from "../src/lib/geocode";
import {
  logGoogleMapsBudgetSummary,
  resetGoogleMapsRequestCount,
} from "../src/lib/google-maps-budget";
import { buildGoogleMapsSearchUrl } from "../src/lib/location";
import { detectCityFromAddress, isFoodPlaceMetadata, scorePlaceNameMatch } from "../src/lib/place-audit";
import { fetchPlaceMetadata, resetPlaceMetadataCache, type PlaceMetadata } from "../src/lib/place-metadata";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../src/lib/supabase/admin";
import { slugify } from "../src/lib/slug";
import type { LocationStatus } from "../src/lib/types";

loadEnvConfig(process.cwd());

type RecommendationRow = {
  id: string;
  restaurant: string;
  restaurant_slug: string;
  city: string;
  city_slug: string;
  area: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  google_maps_url: string | null;
  location_status: LocationStatus;
  location_confidence: number;
  dishes: string[];
  tags: string[];
  cuisine_summary: string | null;
  note: string | null;
  snippet: string | null;
  source_name: string | null;
};

type DescriptorUpdate = {
  id: string;
  restaurant: string;
  city: string;
  current: string | null;
  next: string | null;
  issues: string[];
};

type LocationUpdate = {
  id: string;
  restaurant: string;
  currentCity: string;
  nextCity?: string;
  currentStatus: LocationStatus;
  nextStatus?: LocationStatus;
  currentAddress: string | null;
  nextAddress?: string | null;
  googlePlaceId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string | null;
  locationConfidence?: number;
  issues: string[];
};

type AuditRow = {
  recommendation: RecommendationRow;
  metadata: PlaceMetadata | null;
  descriptorUpdate: DescriptorUpdate | null;
  locationUpdate: LocationUpdate | null;
  issues: string[];
};

const apply = process.argv.includes("--apply");
const runId = process.env.PLACE_AUDIT_RUN_ID || `place-audit-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const outputDir = path.join("data", "location-audits", runId);

async function main() {
  resetGoogleMapsRequestCount();
  resetPlaceMetadataCache();
  fs.mkdirSync(outputDir, { recursive: true });

  const apiKey = getEnv("GOOGLE_MAPS_SERVER_KEY");
  if (!apiKey) throw new Error("GOOGLE_MAPS_SERVER_KEY must be configured.");
  if (!isSupabaseAdminConfigured()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be configured.");
  }

  const admin = getSupabaseAdminClient();
  await backupProductionTables(admin);

  const { data, error } = await admin.from("recommendations").select("*").order("city").order("restaurant");
  if (error) throw error;

  const rows = (data ?? []) as RecommendationRow[];
  const audits: AuditRow[] = [];
  for (const row of rows) {
    audits.push(await auditRecommendation(row, apiKey));
  }

  const descriptorUpdates = audits.flatMap((audit) => audit.descriptorUpdate ? [audit.descriptorUpdate] : []);
  const locationUpdates = audits.flatMap((audit) => audit.locationUpdate ? [audit.locationUpdate] : []);
  const issueCounts = countIssues(audits.flatMap((audit) => audit.issues));

  writeJson("descriptor-updates.json", descriptorUpdates);
  writeJson("location-updates.json", locationUpdates);
  writeJson("audit-details.json", audits.map(serializeAudit));
  writeReviewCsv(audits);

  if (apply) {
    await applyUpdates(admin, descriptorUpdates, locationUpdates);
  }

  const summary = {
    runId,
    mode: apply ? "apply" : "dry-run",
    total: rows.length,
    descriptorUpdates: descriptorUpdates.length,
    locationUpdates: locationUpdates.length,
    issueCounts,
    outputDir,
  };
  writeJson("summary.json", summary);
  console.log(JSON.stringify(summary, null, 2));
  logGoogleMapsBudgetSummary();
}

async function auditRecommendation(row: RecommendationRow, apiKey: string): Promise<AuditRow> {
  const issues: string[] = [];
  let metadata: PlaceMetadata | null = null;
  let resolvedLocation: Awaited<ReturnType<typeof resolveLocation>> | null = null;

  if (row.google_place_id) {
    metadata = await fetchPlaceMetadata(row.google_place_id, { apiKey });
    if (!metadata) issues.push("place_details_missing");
  }

  const needsResolution =
    row.location_status === "needs_lookup" ||
    row.location_status === "ambiguous" ||
    row.latitude == null ||
    row.longitude == null ||
    !row.google_place_id;

  if (needsResolution) {
    resolvedLocation = await resolveLocation(
      {
        restaurant: row.restaurant,
        city: row.city,
        area: row.area,
        address: row.address,
        googleMapsUrl: row.google_maps_url,
      },
      { apiKey },
    );
    if (resolvedLocation.googlePlaceId) {
      metadata = await fetchPlaceMetadata(resolvedLocation.googlePlaceId, { apiKey }) ?? metadata;
    }
  }

  const descriptorUpdate = buildDescriptorUpdate(row, metadata);
  const locationUpdate = buildLocationUpdate(row, metadata, resolvedLocation, issues);
  if (descriptorUpdate) issues.push(...descriptorUpdate.issues.map((issue) => `descriptor_${issue}`));
  if (locationUpdate) issues.push(...locationUpdate.issues.map((issue) => `location_${issue}`));

  return { recommendation: row, metadata, descriptorUpdate, locationUpdate, issues };
}

function buildDescriptorUpdate(row: RecommendationRow, metadata: PlaceMetadata | null): DescriptorUpdate | null {
  const currentIssues = auditCuisineSummary({
    cuisineSummary: row.cuisine_summary,
    note: row.note,
    snippet: row.snippet,
  }).map((issue) => issue.code);

  if (!metadata) return null;

  const repaired = repairCuisineSummary(row.cuisine_summary, metadata, {
    note: row.note,
    snippet: row.snippet,
  });
  const current = row.cuisine_summary?.trim() || null;
  const next = repaired?.trim() || null;

  if (current === next) return null;
  if (!next && currentIssues.length === 0) return null;

  return {
    id: row.id,
    restaurant: row.restaurant,
    city: row.city,
    current,
    next,
    issues: currentIssues,
  };
}

function buildLocationUpdate(
  row: RecommendationRow,
  metadata: PlaceMetadata | null,
  resolvedLocation: Awaited<ReturnType<typeof resolveLocation>> | null,
  baseIssues: string[],
): LocationUpdate | null {
  const issues = [...baseIssues];
  const address = metadata?.formattedAddress ?? resolvedLocation?.address ?? row.address;
  const detectedCity = detectCityFromAddress(address);
  const nameScore = metadata?.name ? scorePlaceNameMatch(row.restaurant, metadata.name) : null;
  const foodPlace = metadata ? isFoodPlaceMetadata(metadata) : true;

  if (metadata?.name && nameScore != null && nameScore < 0.35) issues.push("low_name_match");
  if (metadata && !foodPlace) issues.push("non_food_place_type");

  const locationFromResolution = resolvedLocation?.googlePlaceId
    ? {
        googlePlaceId: resolvedLocation.googlePlaceId,
        googleMapsUrl:
          resolvedLocation.googleMapsUrl ??
          buildGoogleMapsSearchUrl(row.restaurant, row.city, row.area),
        latitude: resolvedLocation.latitude,
        longitude: resolvedLocation.longitude,
        nextAddress: resolvedLocation.address ?? row.address,
        locationConfidence: resolvedLocation.locationConfidence,
        nextStatus: resolvedLocation.locationStatus,
      }
    : null;

  const desiredCityForMaps = detectedCity ?? row.city;
  const mapsUrlNeedsRepair = !row.google_maps_url || /unsorted/i.test(row.google_maps_url);
  const locationFromMetadata = metadata?.placeId
    ? {
        googlePlaceId: metadata.placeId,
        googleMapsUrl: mapsUrlNeedsRepair
          ? buildPlaceSearchUrl(row.restaurant, desiredCityForMaps, row.area, metadata.placeId)
          : row.google_maps_url,
        latitude: metadata.latitude ?? row.latitude,
        longitude: metadata.longitude ?? row.longitude,
        nextAddress: metadata.formattedAddress ?? row.address,
        locationConfidence: Math.max(row.location_confidence ?? 0, 0.92),
        nextStatus: "resolved_from_places" as LocationStatus,
      }
    : null;

  const candidate = locationFromResolution ?? locationFromMetadata;
  let nextCity: string | undefined;
  if (row.city === "Unsorted" && detectedCity) {
    nextCity = detectedCity;
    issues.push("city_from_verified_address");
  } else if (detectedCity && slugify(detectedCity) !== row.city_slug) {
    issues.push("city_address_mismatch");
  }

  const highRisk = issues.includes("low_name_match") || issues.includes("city_address_mismatch");
  const shouldClearBadPin = highRisk && !nextCity;
  const nextStatus = highRisk && !nextCity ? "ambiguous" : candidate?.nextStatus;
  const nextAddress = shouldClearBadPin ? null : candidate?.nextAddress;
  const googlePlaceId = shouldClearBadPin ? null : candidate?.googlePlaceId;
  const googleMapsUrl = shouldClearBadPin
    ? buildGoogleMapsSearchUrl(row.restaurant, row.city, row.area)
    : candidate?.googleMapsUrl;
  const latitude = shouldClearBadPin ? null : candidate?.latitude;
  const longitude = shouldClearBadPin ? null : candidate?.longitude;
  const locationConfidence = shouldClearBadPin ? 0 : candidate?.locationConfidence;
  const hasLocationChange =
    nextCity ||
    (googlePlaceId !== undefined && googlePlaceId !== row.google_place_id) ||
    (googleMapsUrl !== undefined && googleMapsUrl !== row.google_maps_url) ||
    (nextAddress !== undefined && nextAddress !== row.address) ||
    (latitude !== undefined && !numbersEqual(latitude, row.latitude)) ||
    (longitude !== undefined && !numbersEqual(longitude, row.longitude)) ||
    (locationConfidence !== undefined && !numbersEqual(locationConfidence, row.location_confidence)) ||
    (nextStatus !== undefined && nextStatus !== row.location_status);

  if (!hasLocationChange) return null;

  return {
    id: row.id,
    restaurant: row.restaurant,
    currentCity: row.city,
    nextCity,
    currentStatus: row.location_status,
    nextStatus,
    currentAddress: row.address,
    nextAddress,
    googlePlaceId,
    googleMapsUrl,
    latitude,
    longitude,
    locationConfidence,
    issues,
  };
}

function buildPlaceSearchUrl(
  restaurant: string,
  city: string | null | undefined,
  area: string | null | undefined,
  placeId: string,
) {
  const query = [restaurant, area, city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(placeId)}`;
}

function numbersEqual(left: number | null | undefined, right: number | null | undefined) {
  if (left == null || right == null) return left == null && right == null;
  return Math.abs(left - right) < 0.000001;
}

async function applyUpdates(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  descriptorUpdates: DescriptorUpdate[],
  locationUpdates: LocationUpdate[],
) {
  const descriptorById = new Map(descriptorUpdates.map((update) => [update.id, update]));
  const locationById = new Map(locationUpdates.map((update) => [update.id, update]));
  const ids = new Set([...descriptorById.keys(), ...locationById.keys()]);

  for (const id of ids) {
    const descriptor = descriptorById.get(id);
    const location = locationById.get(id);
    const payload: Record<string, unknown> = {
      updated_by: "place-auditor",
      updated_at: new Date().toISOString(),
    };

    if (descriptor) payload.cuisine_summary = descriptor.next;
    if (location?.nextCity) {
      payload.city = location.nextCity;
      payload.city_slug = slugify(location.nextCity);
    }
    if (location?.nextStatus) payload.location_status = location.nextStatus;
    if (location && "googlePlaceId" in location) payload.google_place_id = location.googlePlaceId ?? null;
    if (location && "googleMapsUrl" in location) payload.google_maps_url = location.googleMapsUrl ?? null;
    if (location?.nextAddress !== undefined) payload.address = location.nextAddress;
    if (location?.latitude !== undefined) payload.latitude = location.latitude;
    if (location?.longitude !== undefined) payload.longitude = location.longitude;
    if (location?.locationConfidence !== undefined) payload.location_confidence = location.locationConfidence;

    const { error } = await admin.from("recommendations").update(payload).eq("id", id);
    if (error) throw error;

    await admin.from("edit_events").insert({
      recommendation_id: id,
      editor_name: "place-auditor",
      action: "place_audit_update",
      after_summary: { descriptor, location },
    });
  }
}

async function backupProductionTables(admin: ReturnType<typeof getSupabaseAdminClient>) {
  const backupDir = path.join(outputDir, "production-backup");
  fs.mkdirSync(backupDir, { recursive: true });
  const manifest: Record<string, number> = {};
  for (const table of ["recommendations", "recommendation_sources", "import_batches", "edit_events"]) {
    const { data, error } = await admin.from(table).select("*");
    if (error) throw error;
    fs.writeFileSync(path.join(backupDir, `${table}.json`), JSON.stringify(data ?? [], null, 2));
    manifest[table] = data?.length ?? 0;
  }
  fs.writeFileSync(path.join(backupDir, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), manifest }, null, 2));
}

function countIssues(issues: string[]) {
  return issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue] = (counts[issue] ?? 0) + 1;
    return counts;
  }, {});
}

function serializeAudit(audit: AuditRow) {
  return {
    id: audit.recommendation.id,
    restaurant: audit.recommendation.restaurant,
    city: audit.recommendation.city,
    placeName: audit.metadata?.name ?? null,
    placeAddress: audit.metadata?.formattedAddress ?? null,
    types: audit.metadata?.types ?? [],
    descriptorUpdate: audit.descriptorUpdate,
    locationUpdate: audit.locationUpdate,
    issues: audit.issues,
  };
}

function writeJson(name: string, value: unknown) {
  fs.writeFileSync(path.join(outputDir, name), JSON.stringify(value, null, 2));
}

function writeReviewCsv(audits: AuditRow[]) {
  const headers = [
    "id",
    "restaurant",
    "city",
    "placeName",
    "placeAddress",
    "currentSummary",
    "nextSummary",
    "currentStatus",
    "nextStatus",
    "nextCity",
    "issues",
  ];
  const rows = audits.map((audit) => [
    audit.recommendation.id,
    audit.recommendation.restaurant,
    audit.recommendation.city,
    audit.metadata?.name ?? "",
    audit.metadata?.formattedAddress ?? "",
    audit.recommendation.cuisine_summary ?? "",
    audit.descriptorUpdate?.next ?? "",
    audit.recommendation.location_status,
    audit.locationUpdate?.nextStatus ?? "",
    audit.locationUpdate?.nextCity ?? "",
    audit.issues.join("; "),
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  fs.writeFileSync(path.join(outputDir, "review.csv"), csv);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
