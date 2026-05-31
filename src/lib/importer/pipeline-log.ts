import { appendFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";

const LOG_PATH = join(process.cwd(), "data", "import-pipeline.log");

function timestamp(): string {
  return new Date().toISOString();
}

/** Progress lines for local import runs (stdout + optional log file). */
export function pipelineLog(message: string): void {
  const line = `[${timestamp()}] ${message}`;
  console.log(line);
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, `${line}\n`, "utf8");
  } catch {
    // ignore log file errors; stdout is enough
  }
}
