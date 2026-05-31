import { z } from "zod";

export type LlmClientOptions = {
  endpoint?: string;
  model?: string;
  fallbackModel?: string;
  fetcher?: typeof fetch;
};

type OllamaChatResponse = {
  message?: { content?: string };
  response?: string;
};

export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

export async function chatJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: LlmClientOptions & { system?: string } = {},
): Promise<{ data: T; model: string }> {
  const endpoint = options.endpoint ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const model = options.model ?? process.env.OLLAMA_MODEL ?? "qwen3:4b";
  const fallbackModel = options.fallbackModel ?? process.env.OLLAMA_FALLBACK_MODEL ?? "llama3.2:3b";
  const fetcher = options.fetcher ?? fetch;
  const system =
    options.system ??
    "You extract structured food recommendation data from WhatsApp group chat. Return strict JSON only.";

  try {
    return await chatJsonWithModel(prompt, schema, { endpoint, model, fetcher, system });
  } catch (primaryError) {
    if (fallbackModel === model) throw primaryError;
    return chatJsonWithModel(prompt, schema, { endpoint, model: fallbackModel, fetcher, system });
  }
}

async function chatJsonWithModel<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: { endpoint: string; model: string; fetcher: typeof fetch; system: string },
): Promise<{ data: T; model: string }> {
  const response = await options.fetcher(`${options.endpoint.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: options.model,
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama ${options.model} failed with ${response.status}`);
  }

  const payload = (await response.json()) as OllamaChatResponse;
  const raw = payload.message?.content ?? payload.response ?? "";
  const parsed = schema.parse(JSON.parse(extractJson(raw)));
  return { data: parsed, model: options.model };
}
