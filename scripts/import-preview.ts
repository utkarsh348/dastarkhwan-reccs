import { extractInput, writePreview } from "./import-common";

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: pnpm import:preview "<zip-or-text-path>"');
  }

  const sourceType = inputPath.toLowerCase().endsWith(".zip") ? "whatsapp_zip" : "snippet";
  const payload = await extractInput(inputPath, sourceType);
  await writePreview(payload);

  console.log(
    `Preview complete: ${payload.parsedMessageCount} messages, ${payload.recommendations.length} recommendations.`,
  );
}

main();
