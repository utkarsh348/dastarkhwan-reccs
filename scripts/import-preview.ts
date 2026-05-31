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

async function main() {
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
  const pipeline = await runImportPipeline({ inputPath, inputText: text });
  await writeSessions(pipeline);

  const payload = await extractInput(inputPath, sourceType, pipeline, {
    skipGeocode: shouldSkipGeocode(flags),
    geocodeLockedOnly: true,
  });
  await writePreview(payload);

  console.log(
    `Preview complete: ${payload.parsedMessageCount} messages, ${payload.sessionCount} sessions, ${payload.recommendations.length} recommendations.`,
  );
  logGoogleMapsBudgetSummary();
}

main();
