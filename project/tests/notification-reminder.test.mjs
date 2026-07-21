import assert from "node:assert/strict";
import test from "node:test";

import {
  getDuePlanReminders,
  getPlanReminderPayload,
} from "../lib/notifications/planReminder.ts";
import { getReminderPayload } from "../lib/notifications/reminder.ts";

const approvedPlan = {
  targetDate: "2026-07-21",
  createdAt: "2026-07-20T12:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
  approvalStatus: "approved",
  approvedActionIds: [],
  generationSource: "fallback",
  plan: {
    condition: {
      level: "normal",
      label: "通常",
      summary: "",
      evidence: [],
      disclaimer: "",
    },
    keep: [{
      id: "keep-standup",
      taskId: "standup",
      title: "チーム朝会",
      originalTime: "10:00",
      proposedTime: "10:00",
      endTime: "10:30",
      reason: "",
      impact: "medium",
    }],
    move: [],
    reschedule: [],
    restBlocks: [],
    rationale: [],
  },
};

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

test("a confirmed activity becomes due five minutes before its start", () => {
  const reminders = getDuePlanReminders(
    approvedPlan,
    new Date("2026-07-21T00:55:00.000Z"),
    "Asia/Tokyo",
  );
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].title, "チーム朝会");
});

test("a plan reminder is not sent early or after the activity starts", () => {
  assert.equal(
    getDuePlanReminders(
      approvedPlan,
      new Date("2026-07-21T00:54:59.000Z"),
      "Asia/Tokyo",
    ).length,
    0,
  );
  assert.equal(
    getDuePlanReminders(
      approvedPlan,
      new Date("2026-07-21T01:00:00.000Z"),
      "Asia/Tokyo",
    ).length,
    0,
  );
});

test("draft plans do not create activity reminders", () => {
  assert.equal(
    getDuePlanReminders(
      { ...approvedPlan, approvalStatus: "draft" },
      new Date("2026-07-21T00:55:00.000Z"),
      "Asia/Tokyo",
    ).length,
    0,
  );
});

test("the plan reminder body contains the activity title", () => {
  assert.equal(
    getPlanReminderPayload("チーム朝会", "jp-ja").body,
    "チーム朝会",
  );
  assert.equal(
    getPlanReminderPayload("Team stand-up", "us-en").body,
    "Team stand-up",
  );
});
