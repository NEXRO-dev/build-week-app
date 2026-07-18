import {
  CloudflareConfigMissingError,
  CloudflareStructuredOutputError,
  CloudflareWorkersAiError,
} from "./client";

export function cloudflareApiErrorResponse(error: unknown) {
  if (error instanceof CloudflareConfigMissingError) {
    return Response.json(
      {
        error: "Cloudflare Workers AIの設定が完了していません。",
        code: "CLOUDFLARE_CONFIG_MISSING",
      },
      { status: 503 },
    );
  }

  if (error instanceof CloudflareWorkersAiError) {
    if (error.status === 401 || error.status === 403) {
      return Response.json(
        {
          error: "CloudflareのAccount IDまたはAPIトークンを確認してください。",
          code: "CLOUDFLARE_AUTH_FAILED",
        },
        { status: 503 },
      );
    }

    if (error.status === 429) {
      return Response.json(
        {
          error: "Cloudflare Workers AIの利用上限に達しました。時間をおいて再試行してください。",
          code: "CLOUDFLARE_LIMIT_REACHED",
        },
        { status: 429 },
      );
    }
  }

  if (error instanceof CloudflareStructuredOutputError) {
    console.error(error);
    return Response.json(
      {
        error: "AIの解析結果を確認できませんでした。もう一度お試しください。",
        code: "CLOUDFLARE_INVALID_RESPONSE",
      },
      { status: 502 },
    );
  }

  console.error(error);

  return Response.json(
    {
      error: "AI処理を完了できませんでした。時間をおいて再試行してください。",
      code: "CLOUDFLARE_REQUEST_FAILED",
    },
    { status: 502 },
  );
}
