import { Buffer } from "node:buffer";

import { getAuthErrorResponse } from "@/lib/auth-api";
import {
  CloudflareStructuredOutputError,
  getCloudflareTranscriptionModel,
  runCloudflareModel,
} from "@/lib/cloudflare/client";
import { cloudflareApiErrorResponse } from "@/lib/cloudflare/route-error";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const authError = await getAuthErrorResponse(request);
    if (authError) return authError;

    const formData = await request.formData();
    const audio = formData.get("audio");

    const context = formData.get("context");
    const isEnglish = formData.get("locale") === "us-en";
    if (!(audio instanceof File) || audio.size === 0) {
      return Response.json(
        { error: "音声ファイルが必要です。", code: "AUDIO_REQUIRED" },
        { status: 400 },
      );
    }

    if (audio.size > MAX_AUDIO_BYTES) {
      return Response.json(
        { error: "音声ファイルは4MB以下にしてください。", code: "AUDIO_TOO_LARGE" },
        { status: 413 },
      );
    }

    const initialPrompt = isEnglish
      ? context === "reflection"
        ? "This is a reflection on today: completed work, feelings, energy, and concerns. Transcribe accurately in natural English."
        : context === "planning"
          ? "These are tomorrow's plans and tasks, including meetings, people, times, and deadlines. Transcribe accurately in natural English."
          : "This is an English voice check-in about today and tomorrow. Transcribe names, times, meetings, and concerns accurately."
      : context === "reflection"
        ? "今日の振り返りです。今日やったこと、終えたこと、気持ち、疲れ、悩みを話します。自然な日本語で正確に文字起こししてください。"
        : context === "planning"
          ? "明日の予定とタスクです。会議名、人名、時刻、期限、やることを話します。自然な日本語で正確に文字起こししてください。"
          : "今日の振り返りと明日の予定を話す日本語のチェックインです。会議名、人名、時刻、悩みを正確に文字起こししてください。";

    const audioBase64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
    const result = await runCloudflareModel(
      getCloudflareTranscriptionModel(),
      {
        audio: audioBase64,
        task: "transcribe",
        language: isEnglish ? "en" : "ja",
        vad_filter: true,
        initial_prompt: initialPrompt,
      },
    );

    const transcript =
      result &&
      typeof result === "object" &&
      "text" in result &&
      typeof result.text === "string"
        ? result.text.trim()
        : "";

    if (!transcript) {
      throw new CloudflareStructuredOutputError(
        "Cloudflare Workers AI returned no transcription.",
      );
    }

    return Response.json({ transcript });
  } catch (error) {
    return cloudflareApiErrorResponse(error);
  }
}
