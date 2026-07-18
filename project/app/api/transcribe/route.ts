import { getOpenAIClient, getTranscriptionModel } from "@/lib/openai/client";
import { apiErrorResponse } from "@/lib/openai/route-error";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

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
        { error: "音声ファイルは20MB以下にしてください。", code: "AUDIO_TOO_LARGE" },
        { status: 413 },
      );
    }

    const openai = getOpenAIClient();
    const result = await openai.audio.transcriptions.create({
      file: audio,
      model: getTranscriptionModel(),
      language: "ja",
      response_format: "json",
      prompt: "翌日の予定、会議名、人名、時刻を含む日本語の夜間チェックインです。",
    });

    return Response.json({ transcript: result.text.trim() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
