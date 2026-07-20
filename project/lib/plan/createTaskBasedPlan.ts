import { normalizeClockTime } from "@/lib/tasks/time";
import type {
  ConditionSignal,
  ExtractedTask,
  PlanItem,
  RestBlock,
  TomorrowPlan,
} from "@/types/echly";

type Locale = "jp-ja" | "us-en";

type Interval = { start: number; end: number };

function minutes(time: string | null | undefined) {
  const normalized = normalizeClockTime(time);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function clock(totalMinutes: number) {
  const value = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(
    value % 60
  )
    .toString()
    .padStart(2, "0")}`;
}

function durationFor(task: ExtractedTask) {
  const start = minutes(task.startTime);
  const end = minutes(task.endTime);
  if (start !== null && end !== null && end > start) return end - start;
  return task.burden === "high" ? 90 : task.burden === "medium" ? 60 : 30;
}

function impactFor(task: ExtractedTask): PlanItem["impact"] {
  return task.importance === "high"
    ? "high"
    : task.importance === "medium"
      ? "medium"
      : "low";
}

function overlaps(intervals: Interval[], start: number, end: number) {
  return intervals.some((interval) => start < interval.end && interval.start < end);
}

function reserve(intervals: Interval[], start: number, end: number) {
  intervals.push({ start, end });
  intervals.sort((first, second) => first.start - second.start);
}

function findOpenStart(intervals: Interval[], duration: number) {
  for (let start = 8 * 60; start + duration <= 20 * 60; start += 30) {
    if (!overlaps(intervals, start, start + duration)) return start;
  }
  return null;
}

function createRestBlock(
  condition: ConditionSignal,
  intervals: Interval[],
  locale: Locale,
): RestBlock | null {
  const duration = condition.level === "high" ? 60 : 30;
  const candidates = [12 * 60, 12 * 60 + 30, 13 * 60, 15 * 60];
  const start =
    candidates.find((candidate) => !overlaps(intervals, candidate, candidate + duration)) ??
    findOpenStart(intervals, duration);
  if (start === null) return null;
  reserve(intervals, start, start + duration);
  return {
    id: `rest-${clock(start).replace(":", "")}`,
    startTime: clock(start),
    endTime: clock(start + duration),
    reason:
      locale === "us-en"
        ? condition.level === "high"
          ? "Protect recovery time because today's load signal is high."
          : "Keep a short break between tomorrow's activities."
        : condition.level === "high"
          ? "今日の負荷シグナルが高いため、回復のための時間を確保します。"
          : "明日の予定の間に、短い休息時間を確保します。",
  };
}

function createItem(
  task: ExtractedTask,
  kind: "keep" | "move" | "reschedule",
  proposedTime: string | null,
  locale: Locale,
): PlanItem {
  const reasons = {
    keep:
      locale === "us-en"
        ? "Keep the time stated by the user or protect this important commitment."
        : "音声で指定された時刻、または重要な予定を優先して守ります。",
    move:
      locale === "us-en"
        ? "Place this flexible task in an open time block."
        : "調整可能な作業を、空いている時間帯に配置します。",
    reschedule:
      locale === "us-en"
        ? "Move this flexible task to reduce tomorrow's workload."
        : "明日の負荷を抑えるため、調整可能な作業を延期候補にします。",
  } as const;

  return {
    id: `${kind}-${task.id}`,
    taskId: task.id,
    title: task.title,
    originalTime: normalizeClockTime(task.startTime),
    proposedTime,
    endTime:
      kind === "reschedule" ? null : normalizeClockTime(task.endTime),
    reason: reasons[kind],
    impact: impactFor(task),
  };
}

export function createTaskBasedPlan(
  tasks: ExtractedTask[],
  condition: ConditionSignal,
  locale: Locale = "jp-ja",
): TomorrowPlan {
  const intervals: Interval[] = [];
  for (const task of tasks) {
    const start = minutes(task.startTime);
    if (start === null) continue;
    reserve(intervals, start, start + durationFor(task));
  }

  const rest = createRestBlock(condition, intervals, locale);
  const keep: PlanItem[] = [];
  const move: PlanItem[] = [];
  const reschedule: PlanItem[] = [];

  const ordered = [...tasks].sort((first, second) => {
    const importance = { high: 0, medium: 1, low: 2 } as const;
    return importance[first.importance] - importance[second.importance];
  });

  for (const task of ordered) {
    const spokenTime = normalizeClockTime(task.startTime);
    const fixed = Boolean(spokenTime) || !task.movable || task.importance === "high";
    const shouldReschedule =
      !fixed &&
      condition.level === "high" &&
      (task.importance === "low" || task.burden === "high");

    if (shouldReschedule) {
      reschedule.push(
        createItem(
          task,
          "reschedule",
          locale === "us-en" ? "Next business day" : "翌営業日",
          locale,
        ),
      );
      continue;
    }

    if (spokenTime) {
      keep.push(createItem(task, "keep", spokenTime, locale));
      continue;
    }

    const duration = durationFor(task);
    const start = findOpenStart(intervals, duration);
    const proposedTime = start === null ? null : clock(start);
    if (start !== null) reserve(intervals, start, start + duration);

    const scheduledItem = createItem(
      task,
      fixed || condition.level === "normal" ? "keep" : "move",
      proposedTime,
      locale,
    );
    if (start !== null) scheduledItem.endTime = clock(start + duration);

    if (fixed || condition.level === "normal") {
      keep.push(scheduledItem);
    } else {
      move.push(scheduledItem);
    }
  }

  const rationale =
    locale === "us-en"
      ? [
          "Times explicitly stated in the recording are kept unchanged.",
          "Every saved task appears exactly once in the plan.",
          condition.level === "high"
            ? "Flexible low-priority work is deferred because the load signal is high."
            : "Flexible work is placed around fixed commitments and a rest break.",
        ]
      : [
          "録音で明示された時刻は変更せず、そのまま反映しています。",
          "保存された明日の予定を、重複なく1回ずつ配置しています。",
          condition.level === "high"
            ? "負荷シグナルが高いため、優先度の低い調整可能な作業は延期候補にしています。"
            : "固定予定と休息時間を避けて、調整可能な作業を配置しています。",
        ];

  return {
    condition,
    keep,
    move,
    reschedule,
    restBlocks: rest ? [rest] : [],
    emailDrafts: [],
    rationale,
  };
}

export function completePlanWithTasks(
  generated: TomorrowPlan,
  tasks: ExtractedTask[],
  locale: Locale = "jp-ja",
) {
  const fallback = createTaskBasedPlan(tasks, generated.condition, locale);
  const taskIds = new Set(tasks.map((task) => task.id));
  const used = new Set<string>();

  function validItems(items: PlanItem[]) {
    return items.filter((item) => {
      if (!item.taskId || !taskIds.has(item.taskId) || used.has(item.taskId)) {
        return false;
      }
      used.add(item.taskId);
      return true;
    });
  }

  const keep = validItems(generated.keep);
  const move = validItems(generated.move);
  const reschedule = validItems(generated.reschedule);
  const fallbackByKind = [
    [fallback.keep, keep],
    [fallback.move, move],
    [fallback.reschedule, reschedule],
  ] as const;

  for (const [fallbackItems, target] of fallbackByKind) {
    for (const item of fallbackItems) {
      if (!item.taskId || used.has(item.taskId)) continue;
      target.push(item);
      used.add(item.taskId);
    }
  }

  const rescheduledTaskIds = new Set(
    reschedule.flatMap((item) => (item.taskId ? [item.taskId] : [])),
  );

  return {
    ...generated,
    keep,
    move,
    reschedule,
    emailDrafts: generated.emailDrafts.filter(
      (draft) =>
        draft.relatedTaskId !== null &&
        rescheduledTaskIds.has(draft.relatedTaskId),
    ),
  };
}
