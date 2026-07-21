import type { TomorrowPlan } from "@/types/echly";

import { normalizeClockTime } from "@/lib/tasks/time";

export type EditablePlanItemKind = "keep" | "move" | "rest" | "reschedule";

function minutes(time: string | null | undefined) {
  const normalized = normalizeClockTime(time);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function clock(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return `${Math.floor(normalized / 60).toString().padStart(2, "0")}:${(
    normalized % 60
  )
    .toString()
    .padStart(2, "0")}`;
}

function shiftedEndTime(
  oldStart: string | null | undefined,
  oldEnd: string | null | undefined,
  newStart: string,
) {
  const previousStart = minutes(oldStart);
  const previousEnd = minutes(oldEnd);
  const nextStart = minutes(newStart);
  if (
    previousStart === null ||
    previousEnd === null ||
    nextStart === null ||
    previousEnd <= previousStart
  ) {
    return normalizeClockTime(oldEnd);
  }
  return clock(nextStart + previousEnd - previousStart);
}

export function movePlanItemToTime(
  plan: TomorrowPlan,
  itemId: string,
  kind: EditablePlanItemKind,
  rawTime: string,
  locale: "jp-ja" | "us-en" = "jp-ja",
): TomorrowPlan {
  const time = normalizeClockTime(rawTime);
  if (!time) return plan;

  if (kind === "rest") {
    return {
      ...plan,
      restBlocks: plan.restBlocks.map((block) =>
        block.id === itemId
          ? {
              ...block,
              startTime: time,
              endTime:
                shiftedEndTime(block.startTime, block.endTime, time) ??
                block.endTime,
            }
          : block,
      ),
    };
  }

  const source = plan[kind].find((item) => item.id === itemId);
  if (!source) return plan;
  const endTime = shiftedEndTime(
    source.proposedTime ?? source.originalTime,
    source.endTime,
    time,
  );

  if (kind === "move") {
    return {
      ...plan,
      move: plan.move.map((item) =>
        item.id === itemId
          ? {
              ...item,
              proposedTime: time,
              endTime,
              reason: locale === "us-en"
                ? "Time changed on the plan screen."
                : "プラン画面で時刻を変更しました。",
            }
          : item,
      ),
    };
  }

  const movedItem = {
    ...source,
    originalTime: source.originalTime ?? source.proposedTime,
    proposedTime: time,
    endTime,
    reason: locale === "us-en"
      ? "Time changed on the plan screen."
      : "プラン画面で時刻を変更しました。",
  };

  return {
    ...plan,
    keep:
      kind === "keep"
        ? plan.keep.filter((item) => item.id !== itemId)
        : plan.keep,
    move: [...plan.move, movedItem],
    reschedule:
      kind === "reschedule"
        ? plan.reschedule.filter((item) => item.id !== itemId)
        : plan.reschedule,
  };
}
