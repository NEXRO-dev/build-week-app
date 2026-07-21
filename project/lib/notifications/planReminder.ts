import type { PlanRecord } from "../../types/echly.ts";
import { normalizeClockTime } from "../tasks/time.ts";
import { localTimeToUtc } from "./time.ts";

export type DuePlanReminder = {
  itemId: string;
  title: string;
  startAt: Date;
};

export function getDuePlanReminders(
  planRecord: PlanRecord | null,
  now: Date,
  timeZone: string,
): DuePlanReminder[] {
  if (!planRecord || planRecord.approvalStatus !== "approved") return [];

  return [...planRecord.plan.keep, ...planRecord.plan.move].flatMap((item) => {
    const time = normalizeClockTime(item.proposedTime ?? item.originalTime);
    if (!time) return [];
    const [hour, minute] = time.split(":").map(Number);
    const startAt = localTimeToUtc(
      planRecord.targetDate,
      hour,
      minute,
      timeZone,
    );
    const reminderAt = startAt.getTime() - 5 * 60_000;
    if (now.getTime() < reminderAt || now.getTime() >= startAt.getTime()) {
      return [];
    }
    return [{ itemId: item.id, title: item.title, startAt }];
  });
}

export function getPlanReminderPayload(
  activityTitle: string,
  locale: "jp-ja" | "us-en",
) {
  return locale === "us-en"
    ? {
        title: "Starting in 5 minutes",
        body: activityTitle,
      }
    : {
        title: "5分後の予定",
        body: activityTitle,
      };
}
