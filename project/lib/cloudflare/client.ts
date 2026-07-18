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
    "@cf/openai/whisper-large-v3-turbo"
  );
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

function structuredResponseValue(result: unknown) {
  if (!result || typeof result !== "object") return result;

  const candidate = result as {
    response?: unknown;
    output_text?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  return (
    candidate.response ??
    candidate.output_text ??
    candidate.choices?.[0]?.message?.content ??
    result
  );
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
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return schema.parse(parsed);
  } catch (error) {
    throw new CloudflareStructuredOutputError(
      "Cloudflare Workers AI returned an invalid structured response.",
      { cause: error },
    );
  }
}
