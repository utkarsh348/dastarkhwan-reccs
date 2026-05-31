import { join } from "path";
import { loadEnvConfig } from "@next/env";
import {
  applyImportCliFlags,
  extractInput,
  logGoogleMapsBudgetSummary,
  parseImportCliArgs,
  readImportPreview,
  readWhatsAppInput,
  shouldSkipGeocode,
} from "./import-common";
import { runImportPipeline } from "../src/lib/importer/pipeline";
import { enrichWithLocation } from "../src/lib/enrich-location";
import { getDisplayQuote } from "../src/lib/display-quote";
import { isWeakNote } from "../src/lib/weak-content";
import { mkdir, writeFile } from "fs/promises";
import type { PipelineResult } from "../src/lib/importer/schemas";

loadEnvConfig(process.cwd());

type GapFlag =
  | "missingNote"
  | "missingPlaceId"
  | "missingCuisineSummary"
  | "weakDishesTags"
  | "noDisplayQuote"
  | "multiVenueLeakage";

type RowReport = {
  restaurant: string;
  city: string;
  flags: GapFlag[];
  locationStatus: string | null;
  cuisineSummary: string | null;
  note: string | null;
};

async function main() {
  const flags = parseImportCliArgs(process.argv.slice(2));
  applyImportCliFlags(flags);

  let payload: Awaited<ReturnType<typeof extractInput>>;
  let pipeline: PipelineResult | null = null;

  if (flags.fromPreview) {
    payload = await readImportPreview();
    console.log(`Using existing preview: ${payload.inputName} (${payload.recommendations.length} recommendations)`);
  } else {
    const inputPath = flags.inputPath ?? join(process.cwd(), "data/WhatsApp Chat - Dastarkhwan.zip");
    const sourceType = inputPath.toLowerCase().endsWith(".zip") ? "whatsapp_zip" : "snippet";

    const text = await readWhatsAppInput(inputPath);
    pipeline = await runImportPipeline({ inputPath, inputText: text });
    payload = await extractInput(inputPath, sourceType, pipeline, {
      skipGeocode: shouldSkipGeocode(flags),
      geocodeLockedOnly: true,
    });
  }

  const enrichOptions = {
    skipGeocode: shouldSkipGeocode(flags),
    geocodeLockedOnly: true,
  };

  const restaurantNames = payload.recommendations.map((row) => row.restaurant.toLowerCase());
  const rows: RowReport[] = [];

  for (const row of payload.recommendations) {
    const enriched = await enrichWithLocation(row, enrichOptions);
    const flagsForRow: GapFlag[] = [];

    if (!enriched.note?.trim() || isWeakNote(enriched.note, enriched.restaurant)) flagsForRow.push("missingNote");
    if (!enriched.googlePlaceId) flagsForRow.push("missingPlaceId");
    if (!enriched.cuisineSummary?.trim()) flagsForRow.push("missingCuisineSummary");
    if ((enriched.dishes?.length ?? 0) === 0 && (enriched.tags?.length ?? 0) === 0) {
      flagsForRow.push("weakDishesTags");
    }
    if (!getDisplayQuote(enriched)) flagsForRow.push("noDisplayQuote");

    const noteLower = enriched.note?.toLowerCase() ?? "";
    const others = restaurantNames.filter(
      (name) => name !== row.restaurant.toLowerCase() && name.length > 3 && noteLower.includes(name),
    );
    if (others.length > 0) flagsForRow.push("multiVenueLeakage");

    rows.push({
      restaurant: row.restaurant,
      city: row.city,
      flags: flagsForRow,
      locationStatus: enriched.locationStatus ?? null,
      cuisineSummary: enriched.cuisineSummary ?? null,
      note: enriched.note ?? null,
    });
  }

  const byCity = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.city] = (acc[row.city] ?? 0) + 1;
    return acc;
  }, {});

  const flagCounts = rows.reduce<Record<GapFlag, number>>(
    (acc, row) => {
      for (const flag of row.flags) acc[flag] = (acc[flag] ?? 0) + 1;
      return acc;
    },
    {} as Record<GapFlag, number>,
  );

  const report = {
    inputName: payload.inputName,
    parsedMessageCount: payload.parsedMessageCount,
    sessionCount: payload.sessionCount,
    recommendationCount: payload.recommendations.length,
    model: payload.model,
    byCity,
    flagCounts,
    rows,
    failedSessions:
      pipeline?.extractions.filter((item) => item.error).map((item) => ({
        sessionId: item.sessionId,
        error: item.error,
      })) ?? [],
  };

  const outputPath = join(process.cwd(), "data/import-report.json");
  await mkdir(join(process.cwd(), "data"), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Report: ${payload.recommendations.length} recommendations across ${payload.sessionCount} sessions`);
  console.log(`By city: ${JSON.stringify(byCity)}`);
  console.log(`Gaps: ${JSON.stringify(flagCounts)}`);
  console.log(`Wrote data/import-report.json`);
  logGoogleMapsBudgetSummary();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
