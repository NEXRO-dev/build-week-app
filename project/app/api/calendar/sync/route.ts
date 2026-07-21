import { z } from "zod";

import { auth } from "@/lib/auth";
import { getAuthSession, unauthorizedResponse } from "@/lib/auth-api";
import { GOOGLE_CALENDAR_EVENTS_SCOPE } from "@/lib/google-calendar/constants";
import { syncPlanToGoogleCalendar } from "@/lib/google-calendar/sync";
import { TomorrowPlanSchema } from "@/lib/openai/schemas";

export const runtime = "nodejs";

const CalendarSyncSchema = z.object({
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().min(1).max(100),
  locale: z.enum(["jp-ja", "us-en"]),
  plan: TomorrowPlanSchema,
});

export async function POST(request: Request) {
  try {
    const session = await getAuthSession(request);
    if (!session) return unauthorizedResponse();

    const input = CalendarSyncSchema.parse(await request.json());
    const accounts = await auth.api.listUserAccounts({ headers: request.headers });
    const googleAccount = accounts.find((account) => account.providerId === "google");
    if (!googleAccount?.scopes.includes(GOOGLE_CALENDAR_EVENTS_SCOPE)) {
      return Response.json(
        { error: "Google Calendar is not connected.", code: "CALENDAR_NOT_CONNECTED" },
        { status: 409 },
      );
    }

    let token: Awaited<ReturnType<typeof auth.api.getAccessToken>>;
    try {
      token = await auth.api.getAccessToken({
        body: { providerId: "google", accountId: googleAccount.accountId },
        headers: request.headers,
      });
    } catch {
      return Response.json(
        { error: "Google Calendar authorization has expired.", code: "CALENDAR_RECONNECT_REQUIRED" },
        { status: 401 },
      );
    }

    const result = await syncPlanToGoogleCalendar({
      accessToken: token.accessToken,
      userId: session.user.id,
      ...input,
    });
    return Response.json(result);
  } catch (error) {
    console.error("Failed to sync Google Calendar", error);
    return Response.json(
      { error: "Google Calendar sync failed.", code: "CALENDAR_SYNC_FAILED" },
      { status: 500 },
    );
  }
}
