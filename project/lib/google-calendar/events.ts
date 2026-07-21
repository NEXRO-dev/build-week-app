import { nextDateKey } from "@/lib/date/localTime";
import { localTimeToUtc } from "@/lib/notifications/time";
import type { CalendarEvent } from "@/types/echly";

type GoogleEventDate = {
  date?: string;
  dateTime?: string;
};

type GoogleCalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  transparency?: string;
  start?: GoogleEventDate;
  end?: GoogleEventDate;
  extendedProperties?: {
    private?: Record<string, string>;
  };
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
};

function localParts(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return {
    dateKey: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function toCalendarEvent(
  event: GoogleCalendarEvent,
  targetDate: string,
  timeZone: string,
): CalendarEvent | null {
  if (!event.id || event.status === "cancelled") return null;
  if (event.extendedProperties?.private?.echlyPlanTarget) return null;

  const allDay = Boolean(event.start?.date);
  let startTime = "00:00";
  let endTime = "23:59";
  if (!allDay) {
    if (!event.start?.dateTime || !event.end?.dateTime) return null;
    const start = localParts(event.start.dateTime, timeZone);
    const end = localParts(event.end.dateTime, timeZone);
    if (!start || !end) return null;
    startTime = start.dateKey < targetDate ? "00:00" : start.time;
    endTime = end.dateKey > targetDate ? "23:59" : end.time;
    if (endTime <= startTime) endTime = "23:59";
  }

  return {
    id: event.id,
    title: event.summary?.trim() || "Busy",
    startTime,
    endTime,
    movable: false,
    importance: "high",
    allDay,
    busy: event.transparency !== "transparent",
  };
}

export async function listGoogleCalendarEvents({
  accessToken,
  targetDate,
  timeZone,
}: {
  accessToken: string;
  targetDate: string;
  timeZone: string;
}) {
  const baseUrl = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  );
  baseUrl.searchParams.set(
    "timeMin",
    localTimeToUtc(targetDate, 0, 0, timeZone).toISOString(),
  );
  baseUrl.searchParams.set(
    "timeMax",
    localTimeToUtc(nextDateKey(targetDate), 0, 0, timeZone).toISOString(),
  );
  baseUrl.searchParams.set("singleEvents", "true");
  baseUrl.searchParams.set("orderBy", "startTime");
  baseUrl.searchParams.set("maxResults", "2500");

  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(baseUrl);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Google Calendar API ${response.status}: ${detail.slice(0, 500)}`);
    }
    const data = await response.json() as GoogleCalendarListResponse;
    for (const event of data.items ?? []) {
      const mapped = toCalendarEvent(event, targetDate, timeZone);
      if (mapped) events.push(mapped);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return events;
}
