import { basename } from "path";
import { stableHash } from "../slug";
import { getEnv } from "../env";
import { dedupeCandidates } from "./dedupe";
import { detectReccSessions } from "./session-detect";
import { extractAllSessions } from "./session-extract";
import type { PipelineResult } from "./schemas";
import type { LlmClientOptions } from "./llm-client";
import { parseWhatsAppText, readWhatsAppInput, sortMessagesChronologically } from "./whatsapp";
import { pipelineLog } from "./pipeline-log";

export const PIPELINE_VERSION = "session-v1";

export type RunPipelineOptions = LlmClientOptions & {
  inputPath: string;
  inputText?: string;
};

export async function runImportPipeline(options: RunPipelineOptions): Promise<PipelineResult> {
  if (getEnv("IMPORT_USE_OLLAMA") === "false") {
    throw new Error(
      "Session import pipeline requires Ollama. Set IMPORT_USE_OLLAMA=true and ensure Ollama is running.",
    );
  }

  const text = options.inputText ?? (await readWhatsAppInput(options.inputPath));
  const messages = sortMessagesChronologically(parseWhatsAppText(text));
  pipelineLog(`Parsed ${messages.length} WhatsApp messages`);

  const detect = await detectReccSessions(messages, options);
  pipelineLog(
    `Pass A complete: ${detect.candidateCount} candidates → ${detect.sessions.length} sessions (model: ${detect.model})`,
  );

  const extract = await extractAllSessions(detect.sessions, messages, options);
  pipelineLog(`Pass B complete: ${extract.candidates.length} candidates before dedupe`);

  const candidates = dedupeCandidates(extract.candidates);
  pipelineLog(`Deduped to ${candidates.length} recommendation candidates`);

  const models = [detect.model, ...extract.extractions.map((item) => item.model)];
  const uniqueModels = [...new Set(models.filter(Boolean))];

  return {
    inputName: basename(options.inputPath),
    inputHash: stableHash([options.inputPath, text]),
    model: uniqueModels.join(" + "),
    pipelineVersion: PIPELINE_VERSION,
    parsedMessageCount: messages.length,
    sessionCount: detect.sessions.length,
    sessions: detect.sessions,
    extractions: extract.extractions,
    candidates,
  };
}

export async function runImportPipelineFromText(
  inputPath: string,
  text: string,
  options: Omit<RunPipelineOptions, "inputPath" | "inputText"> = {},
): Promise<PipelineResult> {
  return runImportPipeline({ ...options, inputPath, inputText: text });
}
