import { OpenAIKeyMissingError } from "./client";

export function apiErrorResponse(error: unknown) {
  if (error instanceof OpenAIKeyMissingError) {
    return Response.json(
      {
        error: "OpenAI APIキーが設定されていません。",
        code: "OPENAI_API_KEY_MISSING",
      },
      { status: 503 },
    );
  }

  console.error(error);

  return Response.json(
    {
      error: "AI処理を完了できませんでした。時間をおいて再試行してください。",
      code: "OPENAI_REQUEST_FAILED",
    },
    { status: 502 },
  );
}
