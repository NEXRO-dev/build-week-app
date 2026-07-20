import assert from "node:assert/strict";
import test from "node:test";

import {
  getZonedNow,
  isReflectionWindowOpen,
} from "../lib/date/localTime.ts";

const TOKYO = "Asia/Tokyo";

test("the combined check-in is closed immediately before 20:00", () => {
  const now = getZonedNow(new Date("2026-07-20T10:59:00.000Z"), TOKYO);
  assert.equal(now.hour, 19);
  assert.equal(isReflectionWindowOpen(now), false);
});

test("the combined check-in opens at 20:00", () => {
  const now = getZonedNow(new Date("2026-07-20T11:00:00.000Z"), TOKYO);
  assert.equal(now.hour, 20);
  assert.equal(isReflectionWindowOpen(now), true);
});

test("the combined check-in remains open through 23:59", () => {
  const now = getZonedNow(new Date("2026-07-20T14:59:00.000Z"), TOKYO);
  assert.equal(now.hour, 23);
  assert.equal(isReflectionWindowOpen(now), true);
});

test("the combined check-in closes again at midnight", () => {
  const now = getZonedNow(new Date("2026-07-20T15:00:00.000Z"), TOKYO);
  assert.equal(now.hour, 0);
  assert.equal(isReflectionWindowOpen(now), false);
});
