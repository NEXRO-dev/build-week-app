import type { ExtractedTask, PlanItem, TomorrowPlan } from "@/types/echly";

import { normalizeClockTime } from "@/lib/tasks/time";

function minutes(time: string | null | undefined) {
  const normalized = normalizeClockTime(time);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function overlaps(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
) {
  return firstStart < secondEnd && secondStart < firstEnd;
}

function impactFor(task: ExtractedTask): PlanItem["impact"] {
  return task.importance === "high"
    ? "high"
    : task.importance === "medium"
      ? "medium"
      : "low";
}

export function applySpokenTimesToPlan(
  plan: TomorrowPlan,
  tasks: ExtractedTask[],
): TomorrowPlan {
  const timedTasks = tasks.filter((task) => normalizeClockTime(task.startTime));
  if (!timedTasks.length) return plan;

  const timedTaskIds = new Set(timedTasks.map((task) => task.id));
  const existingByTaskId = new Map(
    [...plan.keep, ...plan.move, ...plan.reschedule]
      .filter((item) => item.taskId)
      .map((item) => [item.taskId as string, item]),
  );
  const spokenItems = timedTasks.map((task) => {
    const startTime = normalizeClockTime(task.startTime) as string;
    const existing = existingByTaskId.get(task.id);
    return {
      id: existing?.id ?? `spoken-${task.id}`,
      taskId: task.id,
      title: task.title,
      originalTime: startTime,
      proposedTime: startTime,
      endTime: normalizeClockTime(task.endTime),
      reason: "音声で指定された時刻を優先しました。",
      impact: existing?.impact ?? impactFor(task),
    } satisfies PlanItem;
  });

  const spokenIntervals = timedTasks.map((task) => {
    const start = minutes(task.startTime) as number;
    const end = minutes(task.endTime);
    return { start, end: end !== null && end > start ? end : start + 60 };
  });
  const restBlocks = plan.restBlocks.filter((block) => {
    const start = minutes(block.startTime);
    const end = minutes(block.endTime);
    if (start === null || end === null) return true;
    return !spokenIntervals.some((item) =>
      overlaps(start, end, item.start, item.end),
    );
  });

  return {
    ...plan,
    keep: [
      ...plan.keep.filter(
        (item) => !item.taskId || !timedTaskIds.has(item.taskId),
      ),
      ...spokenItems,
    ],
    move: plan.move.filter(
      (item) => !item.taskId || !timedTaskIds.has(item.taskId),
    ),
    reschedule: plan.reschedule.filter(
      (item) => !item.taskId || !timedTaskIds.has(item.taskId),
    ),
    restBlocks,
    emailDrafts: plan.emailDrafts.filter(
      (draft) =>
        !draft.relatedTaskId || !timedTaskIds.has(draft.relatedTaskId),
    ),
  };
}
