import { auth } from "@/lib/auth";

export function unauthorizedResponse() {
  return Response.json(
    { error: "ログインが必要です。", code: "UNAUTHORIZED" },
    { status: 401 },
  );
}

export function getAuthSession(request: Request) {
  return auth.api.getSession({ headers: request.headers });
}

export async function getAuthErrorResponse(request: Request) {
  const session = await getAuthSession(request);

  if (session) return null;

  return unauthorizedResponse();
}