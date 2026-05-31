import { extractInput, writePreview, writeSessions } from "./import-common";
import { readWhatsAppInput } from "../src/lib/importer/whatsapp";
import { runImportPipeline } from "../src/lib/importer/pipeline";

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: pnpm import:preview "<zip-or-text-path>"');
  }

  const sourceType = inputPath.toLowerCase().endsWith(".zip") ? "whatsapp_zip" : "snippet";
  const text = await readWhatsAppInput(inputPath);
  const pipeline = await runImportPipeline({ inputPath, inputText: text });
  await writeSessions(pipeline);

  const payload = await extractInput(inputPath, sourceType, pipeline);
  await writePreview(payload);

  console.log(
    `Preview complete: ${payload.parsedMessageCount} messages, ${payload.sessionCount} sessions, ${payload.recommendations.length} recommendations.`,
  );
}

main();
