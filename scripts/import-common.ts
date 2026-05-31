import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { loadEnvConfig } from "@next/env";
import { parseWhatsAppText, readWhatsAppInput, sortMessagesChronologically } from "../src/lib/importer/whatsapp";
import { runImportPipeline, PIPELINE_VERSION } from "../src/lib/importer/pipeline";
import { resolveLocation } from "../src/lib/geocode";
import { getEnv } from "../src/lib/env";
import type { PipelineResult } from "../src/lib/importer/schemas";
import type { RecommendationInput } from "../src/lib/types";

loadEnvConfig(process.cwd());

export async function extractInput(
  path: string,
  sourceType: "whatsapp_zip" | "snippet",
  existingPipeline?: PipelineResult,
) {
  const text = existingPipeline ? undefined : await readWhatsAppInput(path);
  const pipeline =
    existingPipeline ?? (await runImportPipeline({ inputPath: path, inputText: text! }));
  const recommendations = await geocodeCandidates(pipeline.candidates, sourceType);
  return buildImportPayload(path, pipeline, recommendations);
}

async function geocodeCandidates(
  candidates: PipelineResult["candidates"],
  sourceType: "whatsapp_zip" | "snippet",
): Promise<RecommendationInput[]> {
  const apiKey = getEnv("GOOGLE_MAPS_SERVER_KEY");
  const recommendations: RecommendationInput[] = [];

  for (const candidate of candidates) {
    const base: RecommendationInput = {
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

    if (apiKey) {
      const location = await resolveLocation(base, { apiKey });
      recommendations.push({ ...base, ...location });
    } else {
      recommendations.push({ ...base, locationStatus: "needs_lookup", locationConfidence: 0 });
    }
  }

  return recommendations;
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

export { runImportPipeline, parseWhatsAppText, sortMessagesChronologically, readWhatsAppInput };
