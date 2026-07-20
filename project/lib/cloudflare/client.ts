import "server-only";

import { z } from "zod";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4/accounts";
const REQUEST_TIMEOUT_MS = 120_000;

type CloudflareEnvelope = {
  result?: unknown;
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
};

export class CloudflareConfigMissingError extends Error {
  constructor() {
    super("Cloudflare Workers AI credentials are not configured.");
    this.name = "CloudflareConfigMissingError";
  }
}

export class CloudflareWorkersAiError extends Error {
  status: number;
  code: number | null;

  constructor(message: string, status: number, code: number | null = null) {
    super(message);
    this.name = "CloudflareWorkersAiError";
    this.status = status;
    this.code = code;
  }
}

export class CloudflareStructuredOutputError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CloudflareStructuredOutputError";
  }
}

function getCloudflareConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!accountId || !apiToken) {
    throw new CloudflareConfigMissingError();
  }

  return { accountId, apiToken };
}

export function getCloudflareTextModel() {
  return process.env.CLOUDFLARE_TEXT_MODEL?.trim() || "@cf/openai/gpt-oss-20b";
}

export function getCloudflareTranscriptionModel() {
  return (
    process.env.CLOUDFLARE_TRANSCRIPTION_MODEL?.trim() ||
    "@cf/deepgram/nova-3"
  );
}

export function getCloudflareTranscriptionFallbackModel() {
  const configuredModel =
    process.env.CLOUDFLARE_TRANSCRIPTION_FALLBACK_MODEL?.trim();

  if (configuredModel) return configuredModel;

  // Keep the automatic fallback on a different provider. This also covers an
  // installation that overrides only the primary model in its environment.
  return getCloudflareTranscriptionModel().includes("/deepgram/nova-3")
    ? "@cf/openai/whisper-large-v3-turbo"
    : "@cf/deepgram/nova-3";
}

function modelPath(model: string) {
  if (!/^@[a-z0-9._-]+\/[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(model)) {
    throw new CloudflareConfigMissingError();
  }

  return model;
}

export async function runCloudflareModel(
  model: string,
  input: Record<string, unknown>,
) {
  const { accountId, apiToken } = getCloudflareConfig();
  const response = await fetch(
    `${CLOUDFLARE_API_BASE}/${encodeURIComponent(accountId)}/ai/run/${modelPath(model)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  let payload: CloudflareEnvelope | null = null;
  try {
    payload = (await response.json()) as CloudflareEnvelope;
  } catch {
    // The status code below is still useful when Cloudflare returns a non-JSON error.
  }

  if (!response.ok || payload?.success === false || payload?.result === undefined) {
    const firstError = payload?.errors?.[0] ?? payload?.messages?.[0];
    throw new CloudflareWorkersAiError(
      firstError?.message || `Cloudflare Workers AI request failed (${response.status}).`,
      response.status,
      firstError?.code ?? null,
    );
  }

  return payload.result;
}

export async function runCloudflareAudioModel(
  model: string,
  audio: ArrayBuffer,
  contentType: string,
  parameters: Record<string, string | number | boolean> = {},
) {
  const { accountId, apiToken } = getCloudflareConfig();
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(parameters)) {
    query.set(key, String(value));
  }

  const queryString = query.size ? `?${query.toString()}` : "";
  const response = await fetch(
    `${CLOUDFLARE_API_BASE}/${encodeURIComponent(accountId)}/ai/run/${modelPath(model)}${queryString}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": contentType || "application/octet-stream",
      },
      body: audio,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  let payload: (CloudflareEnvelope & Record<string, unknown>) | null = null;
  try {
    payload = (await response.json()) as CloudflareEnvelope &
      Record<string, unknown>;
  } catch {
    // The status code below is still useful when Cloudflare returns a non-JSON error.
  }

  if (!response.ok || payload?.success === false) {
    const firstError = payload?.errors?.[0] ?? payload?.messages?.[0];
    throw new CloudflareWorkersAiError(
      firstError?.message || `Cloudflare Workers AI request failed (${response.status}).`,
      response.status,
      firstError?.code ?? null,
    );
  }

  if (!payload) {
    throw new CloudflareWorkersAiError(
      "Cloudflare Workers AI returned an empty audio response.",
      response.status,
    );
  }

  return payload.result ?? payload;
}

function contentPartValue(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;

  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const candidate = part as { parsed?: unknown; text?: unknown };
    if (candidate.parsed !== undefined) return candidate.parsed;
    if (candidate.text !== undefined) return candidate.text;
  }

  return undefined;
}

function responsesApiOutputValue(output: unknown) {
  if (!Array.isArray(output)) return undefined;

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as { parsed?: unknown; content?: unknown };
    if (candidate.parsed !== undefined) return candidate.parsed;
    const content = contentPartValue(candidate.content);
    if (content !== undefined) return content;
  }

  return undefined;
}

function structuredResponseValue(result: unknown) {
  if (!result || typeof result !== "object") return result;

  const candidate = result as {
    response?: unknown;
    output_text?: unknown;
    output?: unknown;
    choices?: Array<{
      message?: { parsed?: unknown; content?: unknown };
    }>;
  };
  const message = candidate.choices?.[0]?.message;

  return (
    candidate.response ??
    candidate.output_text ??
    message?.parsed ??
    contentPartValue(message?.content) ??
    responsesApiOutputValue(candidate.output) ??
    result
  );
}

const STRUCTURED_WRAPPER_KEYS = [
  "response",
  "result",
  "data",
  "plan",
  "analysis",
  "draft",
  "json",
] as const;

function parseStructuredResponse<T>(schema: z.ZodType<T>, value: unknown) {
  const candidates: unknown[] = [value];
  let lastError: unknown = new Error("No structured response candidate found.");

  for (let index = 0; index < candidates.length && index < 12; index += 1) {
    let candidate = candidates[index];

    if (typeof candidate === "string") {
      try {
        candidate = JSON.parse(candidate);
      } catch (error) {
        lastError = error;
        continue;
      }
    }

    const parsed = schema.safeParse(candidate);
    if (parsed.success) return parsed.data;
    lastError = parsed.error;

    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    for (const key of STRUCTURED_WRAPPER_KEYS) {
      if (record[key] !== undefined) candidates.push(record[key]);
    }

    const keys = Object.keys(record);
    if (keys.length === 1) candidates.push(record[keys[0]]);
  }

  throw lastError;
}

export async function runCloudflareStructuredOutput<T>({
  systemPrompt,
  input,
  schema,
  maxTokens = 4096,
}: {
  systemPrompt: string;
  input: unknown;
  schema: z.ZodType<T>;
  maxTokens?: number;
}) {
  const result = await runCloudflareModel(getCloudflareTextModel(), {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(input) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: z.toJSONSchema(schema, { target: "draft-7" }),
    },
    max_tokens: maxTokens,
    temperature: 0.1,
  });

  try {
    const value = structuredResponseValue(result);
    return parseStructuredResponse(schema, value);
  } catch (error) {
    throw new CloudflareStructuredOutputError(
      "Cloudflare Workers AI returned an invalid structured response.",
      { cause: error },
    );
  }
}
