import { auth } from "@/lib/auth";
import { getAuthSession, unauthorizedResponse } from "@/lib/auth-api";
import { GOOGLE_CALENDAR_EVENTS_SCOPE } from "@/lib/google-calendar/constants";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getAuthSession(request);
  if (!session) return unauthorizedResponse();

  const accounts = await auth.api.listUserAccounts({ headers: request.headers });
  const googleAccount = accounts.find((account) => account.providerId === "google");
  const connected = Boolean(
    googleAccount?.scopes.includes(GOOGLE_CALENDAR_EVENTS_SCOPE),
  );

  return Response.json(
    { connected },
    { headers: { "Cache-Control": "no-store" } },
  );
}
