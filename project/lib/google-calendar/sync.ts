import { createHash } from "node:crypto";

import { normalizeClockTime } from "@/lib/tasks/time";
import type { TomorrowPlan } from "@/types/echly";

type Locale = "jp-ja" | "us-en";

type GoogleCalendarEvent = {
  id?: string;
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarEvent[];
};

type DesiredEvent = {
  id: string;
  body: Record<string, unknown>;
};

function minutes(time: string | null | undefined) {
  const normalized = normalizeClockTime(time);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function offsetDate(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateTime(dateKey: string, totalMinutes: number) {
  const dayOffset = Math.floor(totalMinutes / (24 * 60));
  const normalizedMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalizedMinutes / 60).toString().padStart(2, "0");
  const minute = (normalizedMinutes % 60).toString().padStart(2, "0");
  return `${offsetDate(dateKey, dayOffset)}T${hour}:${minute}:00`;
}

function eventId(userId: string, targetDate: string, kind: string, itemId: string) {
  return createHash("sha256")
    .update(`${userId}:${targetDate}:${kind}:${itemId}`)
    .digest("hex")
    .slice(0, 40);
}

function desiredEvents(
  userId: string,
  targetDate: string,
  timeZone: string,
  locale: Locale,
  plan: TomorrowPlan,
) {
  const items = [
    ...plan.keep.map((item) => ({
      kind: "keep",
      id: item.id,
      title: item.title,
      startTime: item.proposedTime ?? item.originalTime,
      endTime: item.endTime,
      description: item.reason,
    })),
    ...plan.move.map((item) => ({
      kind: "move",
      id: item.id,
      title: item.title,
      startTime: item.proposedTime ?? item.originalTime,
      endTime: item.endTime,
      description: item.reason,
    })),
    ...plan.restBlocks.map((item) => ({
      kind: "rest",
      id: item.id,
      title: locale === "us-en" ? "Rest block" : "休息時間",
      startTime: item.startTime,
      endTime: item.endTime,
      description: item.reason,
    })),
  ];

  return items.flatMap((item): DesiredEvent[] => {
    const start = minutes(item.startTime);
    if (start === null) return [];
    const requestedEnd = minutes(item.endTime);
    const end = requestedEnd !== null && requestedEnd > start
      ? requestedEnd
      : start + 30;
    const id = eventId(userId, targetDate, item.kind, item.id);

    return [{
      id,
      body: {
        id,
        summary: item.title,
        description: item.description,
        start: { dateTime: dateTime(targetDate, start), timeZone },
        end: { dateTime: dateTime(targetDate, end), timeZone },
        extendedProperties: {
          private: {
            echlyPlanTarget: targetDate,
            echlyPlanItem: `${item.kind}:${item.id}`,
          },
        },
      },
    }];
  });
}

async function googleRequest(
  accessToken: string,
  url: string,
  init?: RequestInit,
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google Calendar API ${response.status}: ${detail.slice(0, 500)}`);
  }
  return response;
}

export async function syncPlanToGoogleCalendar({
  accessToken,
  userId,
  targetDate,
  timeZone,
  locale,
  plan,
}: {
  accessToken: string;
  userId: string;
  targetDate: string;
  timeZone: string;
  locale: Locale;
  plan: TomorrowPlan;
}) {
  const desired = desiredEvents(userId, targetDate, timeZone, locale, plan);
  const listUrl = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  );
  listUrl.searchParams.set("privateExtendedProperty", `echlyPlanTarget=${targetDate}`);
  listUrl.searchParams.set("showDeleted", "false");
  listUrl.searchParams.set("maxResults", "2500");
  const listResponse = await googleRequest(accessToken, listUrl.toString());
  const existing = await listResponse.json() as GoogleCalendarListResponse;
  const existingIds = new Set(
    (existing.items ?? []).flatMap((item) => item.id ? [item.id] : []),
  );
  const desiredIds = new Set(desired.map((event) => event.id));

  await Promise.all(desired.map(async (event) => {
    const baseUrl = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    if (existingIds.has(event.id)) {
      await googleRequest(
        accessToken,
        `${baseUrl}/${encodeURIComponent(event.id)}?sendUpdates=none`,
        { method: "PUT", body: JSON.stringify(event.body) },
      );
      return;
    }
    await googleRequest(
      accessToken,
      `${baseUrl}?sendUpdates=none`,
      { method: "POST", body: JSON.stringify(event.body) },
    );
  }));

  const staleIds = [...existingIds].filter((id) => !desiredIds.has(id));
  await Promise.all(staleIds.map((id) =>
    googleRequest(
      accessToken,
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=none`,
      { method: "DELETE" },
    ),
  ));

  return {
    created: desired.filter((event) => !existingIds.has(event.id)).length,
    updated: desired.filter((event) => existingIds.has(event.id)).length,
    deleted: staleIds.length,
    synced: desired.length,
  };
}
