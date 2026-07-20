import { auth } from "@/lib/auth";

export async function getAuthErrorResponse(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (session) return null;

  return Response.json(
    { error: "ログインが必要です。", code: "UNAUTHORIZED" },
    { status: 401 },
  );
}
