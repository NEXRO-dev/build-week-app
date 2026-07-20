import type { ExtractedTask } from "@/types/echly";

const CLOCK_PATTERN =
  /(?:(午前|午後|朝|昼|夕方|夜)\s*)?([0-2]?\d)(?:\s*[:：]\s*([0-5]?\d)|\s*時(?:\s*(半)|\s*([0-5]?\d)\s*分?)?)/g;

function toClockTime(
  period: string | undefined,
  rawHour: string,
  rawMinute: string | undefined,
  half: string | undefined,
) {
  let hour = Number(rawHour);
  const minute = half ? 30 : Number(rawMinute ?? 0);
  if (!Number.isInteger(hour) || hour > 23 || minute > 59) return null;

  if (period === "午前" && hour === 12) hour = 0;
  if (
    (period === "午後" ||
      period === "昼" ||
      period === "夕方" ||
      period === "夜") &&
    hour < 12
  ) {
    hour += 12;
  }

  return (
    hour.toString().padStart(2, "0") +
    ":" +
    minute.toString().padStart(2, "0")
  );
}

export function extractClockTimes(value: string) {
  const times: string[] = [];
  let inheritedPeriod: string | undefined;
  let previousMatchEnd = 0;
  for (const match of value.matchAll(CLOCK_PATTERN)) {
    const gap = value.slice(previousMatchEnd, match.index ?? 0);
    if (/[。！？]/.test(gap)) inheritedPeriod = undefined;
    if (match[1]) inheritedPeriod = match[1];
    const time = toClockTime(
      match[1] ?? inheritedPeriod,
      match[2],
      match[3] ?? match[5],
      match[4],
    );
    if (time) times.push(time);
    previousMatchEnd = (match.index ?? 0) + match[0].length;
  }
  return times;
}

export function normalizeClockTime(value: string | null | undefined) {
  if (!value) return null;
  if (/正午/.test(value)) return "12:00";
  return extractClockTimes(value)[0] ?? null;
}

export function normalizeExtractedTaskTimes(
  task: ExtractedTask,
): ExtractedTask {
  const sourceTimes = extractClockTimes(task.sourceText);
  const startTime = sourceTimes[0] ?? normalizeClockTime(task.startTime) ?? null;
  const explicitEndTime = normalizeClockTime(task.endTime);
  const endTime =
    sourceTimes.length > 1 && sourceTimes[1] !== startTime
      ? sourceTimes[1]
      : explicitEndTime;

  return {
    ...task,
    startTime,
    endTime,
  };
}