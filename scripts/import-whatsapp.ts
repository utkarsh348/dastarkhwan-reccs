import { extractInput } from "./import-common";
import { getEnv } from "../src/lib/env";

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error('Usage: pnpm import:whatsapp "<zip-or-text-path>"');
  }

  const appUrl = getEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
  const token = getEnv("IMPORT_TOKEN");
  if (!token) throw new Error("IMPORT_TOKEN must be configured before importing.");

  const sourceType = inputPath.toLowerCase().endsWith(".zip") ? "whatsapp_zip" : "snippet";
  const payload = await extractInput(inputPath, sourceType, undefined, {
    skipGeocode: true,
  });

  const response = await fetch(`${appUrl}/api/import`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Import failed with ${response.status}: ${await response.text()}`);
  }

  console.log(`Import complete: ${await response.text()}`);
}

main();
