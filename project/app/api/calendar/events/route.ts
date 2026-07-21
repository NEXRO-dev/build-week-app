import { z } from "zod";

import { auth } from "@/lib/auth";
import { getAuthSession, unauthorizedResponse } from "@/lib/auth-api";
import { GOOGLE_CALENDAR_EVENTS_SCOPE } from "@/lib/google-calendar/constants";
import { listGoogleCalendarEvents } from "@/lib/google-calendar/events";
import { isValidTimeZone } from "@/lib/notifications/time";

export const runtime = "nodejs";

const CalendarEventsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().min(1).max(100).refine(isValidTimeZone),
});

export async function GET(request: Request) {
  try {
    const session = await getAuthSession(request);
    if (!session) return unauthorizedResponse();

    const url = new URL(request.url);
    const input = CalendarEventsQuerySchema.parse({
      date: url.searchParams.get("date"),
      timeZone: url.searchParams.get("timeZone"),
    });
    const accounts = await auth.api.listUserAccounts({ headers: request.headers });
    const googleAccount = accounts.find((account) => account.providerId === "google");
    if (!googleAccount?.scopes.includes(GOOGLE_CALENDAR_EVENTS_SCOPE)) {
      return Response.json(
        { events: [], code: "CALENDAR_NOT_CONNECTED" },
        { status: 409 },
      );
    }

    let accessToken: string;
    try {
      const token = await auth.api.getAccessToken({
        body: { providerId: "google", accountId: googleAccount.accountId },
        headers: request.headers,
      });
      accessToken = token.accessToken;
    } catch {
      return Response.json(
        { events: [], code: "CALENDAR_RECONNECT_REQUIRED" },
        { status: 401 },
      );
    }

    const events = await listGoogleCalendarEvents({
      accessToken,
      targetDate: input.date,
      timeZone: input.timeZone,
    });
    return Response.json(
      { events },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load Google Calendar events", error);
    return Response.json(
      { events: [], code: "CALENDAR_EVENTS_FAILED" },
      { status: 500 },
    );
  }
}
