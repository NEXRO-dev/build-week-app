import assert from "node:assert/strict";
import test from "node:test";

import { getReminderPayload } from "../lib/notifications/reminder.ts";

test("the 20:00 reminder is always generated", () => {
  const payload = getReminderPayload("evening", "us-en");
  assert.equal(payload?.title, "Time for your daily check-in");
  assert.match(payload?.body ?? "", /today's reflection and tomorrow's plans/);
});

test("the 23:30 reminder is skipped after both inputs are complete", () => {
  assert.equal(
    getReminderPayload("follow_up", "jp-ja", {
      reflectionEntered: true,
      tomorrowEntered: true,
    }),
    null,
  );
});

test("the 23:30 reminder identifies both missing inputs", () => {
  const payload = getReminderPayload("follow_up", "jp-ja", {
    reflectionEntered: false,
    tomorrowEntered: false,
  });
  assert.match(payload?.body ?? "", /今日の振り返りと明日の予定/);
});

test("the 23:30 reminder identifies the remaining missing input", () => {
  const payload = getReminderPayload("follow_up", "us-en", {
    reflectionEntered: true,
    tomorrowEntered: false,
  });
  assert.match(payload?.body ?? "", /tomorrow's plans/);
});
