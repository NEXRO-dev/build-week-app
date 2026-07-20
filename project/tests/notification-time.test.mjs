import assert from "node:assert/strict";
import test from "node:test";

import {
  getFollowUpNotificationAt,
  getNextNotificationAt,
  getNextNotificationScheduleAfterProcessing,
} from "../lib/notifications/time.ts";

test("schedules both reminders at the user's local time in Tokyo", () => {
  const now = new Date("2026-07-20T08:00:00.000Z");
  assert.equal(
    getNextNotificationAt(now, "Asia/Tokyo").toISOString(),
    "2026-07-20T11:00:00.000Z",
  );
  assert.equal(
    getFollowUpNotificationAt(now, "Asia/Tokyo").toISOString(),
    "2026-07-20T14:30:00.000Z",
  );
});

test("schedules both reminders at the user's local time in New York", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");
  assert.equal(
    getNextNotificationAt(now, "America/New_York").toISOString(),
    "2026-07-21T00:00:00.000Z",
  );
  assert.equal(
    getFollowUpNotificationAt(now, "America/New_York").toISOString(),
    "2026-07-21T03:30:00.000Z",
  );
});

test("supports half-hour time-zone offsets", () => {
  const now = new Date("2026-07-20T08:00:00.000Z");
  assert.equal(
    getNextNotificationAt(now, "Asia/Kolkata").toISOString(),
    "2026-07-20T14:30:00.000Z",
  );
  assert.equal(
    getFollowUpNotificationAt(now, "Asia/Kolkata").toISOString(),
    "2026-07-20T18:00:00.000Z",
  );
});

test("moves from the 20:00 reminder to the same-day 23:30 follow-up", () => {
  const processedAt = new Date("2026-07-20T11:01:00.000Z");
  const next = getNextNotificationScheduleAfterProcessing(
    processedAt,
    "Asia/Tokyo",
    "evening",
  );
  assert.equal(next.kind, "follow_up");
  assert.equal(next.at.toISOString(), "2026-07-20T14:30:00.000Z");
});

test("moves from the 23:30 follow-up to 20:00 on the next local day", () => {
  const processedAt = new Date("2026-07-20T14:31:00.000Z");
  const next = getNextNotificationScheduleAfterProcessing(
    processedAt,
    "Asia/Tokyo",
    "follow_up",
  );
  assert.equal(next.kind, "evening");
  assert.equal(next.at.toISOString(), "2026-07-21T11:00:00.000Z");
});

test("a follow-up processed after midnight still schedules that day's evening reminder", () => {
  const scheduledAt = new Date("2026-07-20T14:30:00.000Z");
  const processedAt = new Date("2026-07-20T15:05:00.000Z");
  const next = getNextNotificationScheduleAfterProcessing(
    processedAt,
    "Asia/Tokyo",
    "follow_up",
    scheduledAt,
  );
  assert.equal(next.kind, "evening");
  assert.equal(next.at.toISOString(), "2026-07-21T11:00:00.000Z");
});
