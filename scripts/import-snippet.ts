import { extractInput, readSnippetFiles, writePreview } from "./import-common";
import { getEnv } from "../src/lib/env";

async function main() {
  const args = process.argv.slice(2);
  const preview = args.includes("--preview");
  const paths = await readSnippetFiles(args.filter((arg) => arg !== "--preview"));
  const payloads = [];

  for (const path of paths) {
    payloads.push(
      await extractInput(path, "snippet", undefined, {
        skipGeocode: true,
      }),
    );
  }

  if (preview) {
    await writePreview(payloads.length === 1 ? payloads[0] : payloads, "data/snippets.preview.json");
    console.log(
      `Snippet preview complete: ${payloads.reduce((sum, item) => sum + item.recommendations.length, 0)} recommendations.`,
    );
    return;
  }

  const appUrl = getEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
  const token = getEnv("IMPORT_TOKEN");
  if (!token) throw new Error("IMPORT_TOKEN must be configured before importing snippets.");

  for (const payload of payloads) {
    const response = await fetch(`${appUrl}/api/import`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Snippet import failed with ${response.status}: ${await response.text()}`);
    }

    console.log(`Snippet import complete for ${payload.inputName}: ${await response.text()}`);
  }
}

main();
