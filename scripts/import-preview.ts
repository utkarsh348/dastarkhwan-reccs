import {
  applyImportCliFlags,
  extractInput,
  logGoogleMapsBudgetSummary,
  parseImportCliArgs,
  shouldSkipGeocode,
  writePreview,
  writeSessions,
} from "./import-common";
import { readWhatsAppInput } from "../src/lib/importer/whatsapp";
import { runImportPipeline } from "../src/lib/importer/pipeline";
import { pipelineLog } from "../src/lib/importer/pipeline-log";

async function main() {
  const startedAt = Date.now();
  pipelineLog(`import:preview started (${new Date().toISOString()})`);

  const flags = parseImportCliArgs(process.argv.slice(2));
  applyImportCliFlags(flags);

  const inputPath = flags.inputPath;
  if (!inputPath) {
    throw new Error(
      'Usage: pnpm import:preview "<zip-or-text-path>" [--geocode] [--no-geocode]',
    );
  }

  const sourceType = inputPath.toLowerCase().endsWith(".zip") ? "whatsapp_zip" : "snippet";
  const text = await readWhatsAppInput(inputPath);
  pipelineLog(`Loaded input: ${inputPath} (${text.length} chars)`);

  const pipeline = await runImportPipeline({ inputPath, inputText: text });
  pipelineLog(`Pipeline parsed ${pipeline.parsedMessageCount} messages, ${pipeline.sessionCount} sessions`);
  await writeSessions(pipeline);

  const payload = await extractInput(inputPath, sourceType, pipeline, {
    skipGeocode: shouldSkipGeocode(flags),
    geocodeLockedOnly: true,
  });
  await writePreview(payload);

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  pipelineLog(
    `import:preview complete in ${elapsedSec}s: ${payload.parsedMessageCount} messages, ${payload.sessionCount} sessions, ${payload.recommendations.length} recommendations`,
  );
  logGoogleMapsBudgetSummary();
}

main();
