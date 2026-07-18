import { OpenAIKeyMissingError } from "./client";

type OpenAIErrorLike = {
  status?: unknown;
  code?: unknown;
  type?: unknown;
  error?: {
    code?: unknown;
    type?: unknown;
  };
};

function getOpenAIErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") return null;

  const candidate = error as OpenAIErrorLike;
  return {
    status: typeof candidate.status === "number" ? candidate.status : null,
    code:
      typeof candidate.code === "string"
        ? candidate.code
        : typeof candidate.error?.code === "string"
          ? candidate.error.code
          : null,
    type:
      typeof candidate.type === "string"
        ? candidate.type
        : typeof candidate.error?.type === "string"
          ? candidate.error.type
          : null,
  };
}

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

  const details = getOpenAIErrorDetails(error);

  if (
    details?.code === "insufficient_quota" ||
    details?.type === "insufficient_quota"
  ) {
    console.warn("OpenAI quota exceeded; returning a recoverable API error.");
    return Response.json(
      {
        error: "OpenAI APIの利用枠に達しました。デモ処理へ切り替えます。",
        code: "OPENAI_QUOTA_EXCEEDED",
      },
      { status: 429 },
    );
  }

  if (details?.status === 429) {
    return Response.json(
      {
        error: "OpenAI APIが混み合っています。少し待ってから再試行してください。",
        code: "OPENAI_RATE_LIMITED",
      },
      { status: 429 },
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
