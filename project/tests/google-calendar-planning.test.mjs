import assert from "node:assert/strict";
import test from "node:test";

import {
  completePlanWithTasks,
  createTaskBasedPlan,
} from "../lib/plan/createTaskBasedPlan.ts";

const condition = {
  level: "normal",
  summary: "Ready",
};

function task(overrides = {}) {
  return {
    id: "task-1",
    title: "Write proposal",
    startTime: null,
    endTime: null,
    burden: "medium",
    importance: "medium",
    movable: true,
    ...overrides,
  };
}

function calendarEvent(overrides = {}) {
  return {
    id: "google-1",
    title: "Existing meeting",
    startTime: "08:00",
    endTime: "10:00",
    movable: false,
    importance: "high",
    busy: true,
    ...overrides,
  };
}

test("places flexible work outside Google Calendar busy time", () => {
  const plan = createTaskBasedPlan(
    [task()],
    condition,
    "us-en",
    [calendarEvent()],
  );

  assert.equal(plan.keep[0]?.proposedTime, "10:00");
  assert.equal(plan.keep[0]?.endTime, "11:00");
});

test("does not place a rest block over a Google Calendar event", () => {
  const plan = createTaskBasedPlan(
    [],
    condition,
    "us-en",
    [calendarEvent({ startTime: "12:00", endTime: "13:00" })],
  );

  assert.equal(plan.restBlocks[0]?.startTime, "13:00");
});

test("replaces an AI placement that overlaps an existing event", () => {
  const generated = {
    condition,
    keep: [{
      id: "keep-task-1",
      taskId: "task-1",
      title: "Write proposal",
      originalTime: null,
      proposedTime: "09:00",
      endTime: "10:00",
      reason: "Generated placement",
      impact: "medium",
    }],
    move: [],
    reschedule: [],
    restBlocks: [],
    rationale: [],
  };

  const plan = completePlanWithTasks(
    generated,
    [task()],
    "us-en",
    [calendarEvent({ startTime: "09:00", endTime: "10:00" })],
  );

  assert.equal(plan.keep[0]?.proposedTime, "08:00");
});
