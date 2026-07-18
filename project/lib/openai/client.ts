import "server-only";

import OpenAI from "openai";

export class OpenAIKeyMissingError extends Error {
  constructor() {
    super("OPENAI_API_KEY is not configured.");
    this.name = "OpenAIKeyMissingError";
  }
}

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new OpenAIKeyMissingError();
  }

  return new OpenAI({ apiKey });
}

export function getTextModel() {
  return process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-5.6-sol";
}

export function getTranscriptionModel() {
  return (
    process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() ||
    "gpt-4o-mini-transcribe"
  );
}
