import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { loadEnvConfig } from "@next/env";
import { parseWhatsAppText, readWhatsAppInput, sortMessagesChronologically } from "../src/lib/importer/whatsapp";
import { runImportPipeline, PIPELINE_VERSION } from "../src/lib/importer/pipeline";
import { isLockedRecommendation } from "../src/lib/importer/locked-recommendation";
import { resolveLocation, resetGeocodeCache } from "../src/lib/geocode";
import {
  isGoogleMapsSkipGeocode,
  logGoogleMapsBudgetSummary,
  resetGoogleMapsRequestCount,
} from "../src/lib/google-maps-budget";
import { resetPlaceMetadataCache } from "../src/lib/place-metadata";
import { getEnv } from "../src/lib/env";
import type { PipelineResult } from "../src/lib/importer/schemas";
import type { ExtractedRecommendationCandidate } from "../src/lib/importer/schemas";
import type { RecommendationInput } from "../src/lib/types";

loadEnvConfig(process.cwd());

export type ImportCliFlags = {
  geocode: boolean;
  noGeocode: boolean;
  fromPreview: boolean;
  inputPath?: string;
};

export type ExtractInputOptions = {
  /** When true (default), skip Text Search / geocode Place Details during extraction. */
  skipGeocode?: boolean;
  /** When geocoding, only resolve rows that pass isLockedRecommendation. */
  geocodeLockedOnly?: boolean;
};

export function parseImportCliArgs(argv: string[]): ImportCliFlags {
  const geocode = argv.includes("--geocode");
  const noGeocode = argv.includes("--no-geocode");
  const fromPreview = argv.includes("--from-preview");
  const inputPath = argv.find((arg) => !arg.startsWith("--"));
  return { geocode, noGeocode, fromPreview, inputPath };
}

/** Default preview/import extraction skips Maps; opt in with --geocode. */
export function shouldSkipGeocode(flags: Pick<ImportCliFlags, "geocode" | "noGeocode">): boolean {
  if (flags.noGeocode) return true;
  return !flags.geocode;
}

export function applyImportCliFlags(flags: Pick<ImportCliFlags, "noGeocode">): void {
  resetGoogleMapsRequestCount();
  resetGeocodeCache();
  resetPlaceMetadataCache();
  if (flags.noGeocode) {
    process.env.IMPORT_SKIP_GEOCODE = "true";
  } else {
    delete process.env.IMPORT_SKIP_GEOCODE;
  }
}

export async function readImportPreview(previewPath = "data/import-preview.json") {
  const destination = join(process.cwd(), previewPath);
  const raw = await readFile(destination, "utf8");
  return JSON.parse(raw) as Awaited<ReturnType<typeof buildImportPayload>>;
}

export async function extractInput(
  path: string,
  sourceType: "whatsapp_zip" | "snippet",
  existingPipeline?: PipelineResult,
  options?: ExtractInputOptions,
) {
  const text = existingPipeline ? undefined : await readWhatsAppInput(path);
  const pipeline =
    existingPipeline ?? (await runImportPipeline({ inputPath: path, inputText: text! }));
  const skipGeocode = isGoogleMapsSkipGeocode() || (options?.skipGeocode ?? true);
  const recommendations = await buildRecommendationsFromCandidates(
    pipeline.candidates,
    sourceType,
    {
      skipGeocode,
      geocodeLockedOnly: options?.geocodeLockedOnly ?? true,
    },
  );
  return buildImportPayload(path, pipeline, recommendations);
}

export async function buildRecommendationsFromCandidates(
  candidates: ExtractedRecommendationCandidate[],
  sourceType: "whatsapp_zip" | "snippet",
  options: { skipGeocode: boolean; geocodeLockedOnly?: boolean } = {
    skipGeocode: true,
    geocodeLockedOnly: true,
  },
): Promise<RecommendationInput[]> {
  const apiKey =
    options.skipGeocode || isGoogleMapsSkipGeocode() ? null : getEnv("GOOGLE_MAPS_SERVER_KEY");
  const geocodeLockedOnly = options.geocodeLockedOnly ?? true;
  const recommendations: RecommendationInput[] = [];

  for (const candidate of candidates) {
    const base = candidateToRecommendationInput(candidate, sourceType);

    if (apiKey && (!geocodeLockedOnly || isLockedRecommendation(candidate))) {
      const location = await resolveLocation(base, { apiKey });
      recommendations.push({ ...base, ...location });
    } else {
      recommendations.push({ ...base, locationStatus: "needs_lookup", locationConfidence: 0 });
    }
  }

  return recommendations;
}

function candidateToRecommendationInput(
  candidate: ExtractedRecommendationCandidate,
  sourceType: "whatsapp_zip" | "snippet",
): RecommendationInput {
  return {
    restaurant: candidate.restaurant,
    city: candidate.city,
    area: candidate.area,
    address: candidate.address,
    dishes: candidate.dishes,
    tags: candidate.tags,
    note: candidate.note,
    snippet: candidate.snippet,
    sourceName: candidate.sourceName,
    confidence: candidate.confidence,
    googleMapsUrl: candidate.googleMapsUrl,
    sourceHash: candidate.sourceHash,
    sourceType,
    sourceDate: candidate.sourceDate,
    rawRefLabel: candidate.rawRefLabel,
    createdBy: "importer",
  };
}

function buildImportPayload(
  path: string,
  pipeline: PipelineResult,
  recommendations: RecommendationInput[],
) {
  return {
    inputName: basename(path),
    inputHash: pipeline.inputHash,
    model: pipeline.model,
    pipelineVersion: PIPELINE_VERSION,
    parsedMessageCount: pipeline.parsedMessageCount,
    sessionCount: pipeline.sessionCount,
    recommendations,
  };
}

export async function writePreview(payload: unknown, outputPath = "data/import-preview.json") {
  const destination = join(process.cwd(), outputPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

export async function writeSessions(payload: PipelineResult, outputPath = "data/import-sessions.json") {
  const destination = join(process.cwd(), outputPath);
  await mkdir(dirname(destination), { recursive: true });
  const debug = {
    pipelineVersion: payload.pipelineVersion,
    model: payload.model,
    parsedMessageCount: payload.parsedMessageCount,
    sessionCount: payload.sessionCount,
    sessions: payload.sessions,
    extractions: payload.extractions.map((item) => ({
      sessionId: item.sessionId,
      model: item.model,
      durationMs: item.durationMs,
      recommendationCount: item.recommendations.length,
      error: item.error ?? null,
      restaurants: item.recommendations.map((row) => row.restaurant),
    })),
  };
  await writeFile(destination, `${JSON.stringify(debug, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

export async function readSnippetFiles(paths: string[]) {
  if (!paths.length) {
    throw new Error(
      "Provide at least one snippet .txt path, e.g. pnpm import:snippet --preview data/snippets/my-snippet.txt",
    );
  }
  for (const path of paths) {
    await readFile(path, "utf8");
  }
  return paths;
}

export { runImportPipeline, parseWhatsAppText, sortMessagesChronologically, readWhatsAppInput, logGoogleMapsBudgetSummary };
