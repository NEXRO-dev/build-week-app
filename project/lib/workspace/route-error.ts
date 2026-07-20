import { ZodError } from "zod";

export function workspaceApiErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: "保存するデータの形式が正しくありません。", code: "INVALID_DATA" },
      { status: 400 },
    );
  }

  console.error("[workspace]", error);
  return Response.json(
    {
      error: "データベースへの保存または読み込みに失敗しました。",
      code: "DATABASE_REQUEST_FAILED",
    },
    { status: 500 },
  );
}
