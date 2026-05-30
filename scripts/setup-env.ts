import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";

const values: Record<string, string> = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  IMPORT_TOKEN: existing.match(/^IMPORT_TOKEN=(.+)$/m)?.[1] ?? "change-this-local-import-token",
};

let next = existing;
for (const [name, value] of Object.entries(values)) {
  const line = `${name}=${value}`;
  if (new RegExp(`^${name}=`, "m").test(next)) {
    next = next.replace(new RegExp(`^${name}=.*$`, "m"), line);
  } else {
    next += `${next.endsWith("\n") || !next ? "" : "\n"}${line}\n`;
  }
}

writeFileSync(envPath, next);
console.log(
  "Updated .env.local with non-secret defaults. Copy keys from .env.example into .env.local manually — never commit key files.",
);
