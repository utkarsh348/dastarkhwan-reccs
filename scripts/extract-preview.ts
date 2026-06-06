import { previewContextualExtraction, writeContextualReviewFiles } from "../src/lib/importer/contextual";

function parseNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: pnpm extract:preview "<whatsapp-zip-path>"');
  }

  const runId = process.env.EXTRACT_RUN_ID;
  const result = await previewContextualExtraction(inputPath, {
    runId,
    useOllama: process.env.EXTRACT_USE_OLLAMA !== "false",
    maxOllamaThreads: parseNumber(process.env.EXTRACT_MAX_OLLAMA_THREADS, Number.POSITIVE_INFINITY),
    ollamaTimeoutMs: parseNumber(process.env.EXTRACT_OLLAMA_TIMEOUT_MS, 45_000),
    onProgress: (message) => console.log(message),
  });
  const destination = await writeContextualReviewFiles(result);
  console.log(`Preview complete: ${result.parsedMessageCount} messages, ${result.candidates.length} candidates.`);
  console.log(`Wrote ${destination}`);
}

main();
