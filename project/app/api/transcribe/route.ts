import { Buffer } from "node:buffer";

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
    const formData = await request.formData();
    const audio = formData.get("audio");

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

    const audioBase64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
    const result = await runCloudflareModel(
      getCloudflareTranscriptionModel(),
      {
        audio: audioBase64,
        task: "transcribe",
        language: "ja",
        vad_filter: true,
        initial_prompt:
          "今日の振り返り、明日の予定、会議名、人名、時刻、悩みを含む日本語のチェックインです。",
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
