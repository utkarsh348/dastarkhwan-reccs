import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, dirname, join } from "path";
import { loadEnvConfig } from "@next/env";
import {
  dedupeCandidates,
  extractRecommendationCandidates,
  parseWhatsAppText,
  readWhatsAppInput,
  sortMessagesChronologically,
} from "../src/lib/importer/whatsapp";
import { extractRecommendationCandidatesWithOllama } from "../src/lib/importer/ollama";
import { resolveLocation } from "../src/lib/geocode";
import { getEnv } from "../src/lib/env";
import { stableHash } from "../src/lib/slug";
import type { RecommendationInput } from "../src/lib/types";

loadEnvConfig(process.cwd());

export async function extractInput(path: string, sourceType: "whatsapp_zip" | "snippet") {
  const text = await readWhatsAppInput(path);
  const messages = sortMessagesChronologically(parseWhatsAppText(text));
  const heuristicCandidates = extractRecommendationCandidates(messages);
  let candidates = dedupeCandidates(heuristicCandidates);
  let model = process.env.OLLAMA_MODEL ?? "qwen3:4b";

  if (getEnv("IMPORT_USE_OLLAMA") !== "false") {
    try {
      const ollama = await extractRecommendationCandidatesWithOllama(messages);
      model = ollama.model;
      candidates = dedupeCandidates([...heuristicCandidates, ...ollama.candidates]);
    } catch (error) {
      model = `${model} (deterministic fallback)`;
      console.warn(
        `Ollama extraction unavailable; using deterministic extractor only. ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

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

  return {
    inputName: basename(path),
    inputHash: stableHash([path, text]),
    model,
    parsedMessageCount: messages.length,
    recommendations,
  };
}

export async function writePreview(payload: unknown, outputPath = "data/import-preview.json") {
  const destination = join(process.cwd(), outputPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
}

export async function readSnippetFiles(paths: string[]) {
  if (paths.length) return paths;
  const defaultPath = join(process.cwd(), "data/snippets/srinagar-2026-05-09.txt");
  await readFile(defaultPath, "utf8");
  return [defaultPath];
}
