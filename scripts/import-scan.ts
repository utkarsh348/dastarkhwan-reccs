import { readWhatsAppInput, parseWhatsAppText, sortMessagesChronologically } from "../src/lib/importer/whatsapp";
import { scanRequestCandidates } from "../src/lib/importer/session-detect";

async function main() {
  const inputPath = process.argv[2] ?? "data/WhatsApp Chat - Dastarkhwan.zip";
  const text = await readWhatsAppInput(inputPath);
  const messages = sortMessagesChronologically(parseWhatsAppText(text));
  const candidates = scanRequestCandidates(messages);

  console.log(`Parsed ${messages.length} messages from ${inputPath}`);
  console.log(`Heuristic recc-request candidates: ${candidates.length}`);
  console.log(`Sample indices: ${candidates.slice(0, 8).join(", ")}`);
}

main();
