import { nextDateKey } from "@/lib/date/localTime";

type ZonedParts = {
  dateKey: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function numberPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return Number(parts.find((part) => part.type === type)?.value ?? 0);
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const year = numberPart(parts, "year");
  const month = numberPart(parts, "month");
  const day = numberPart(parts, "day");

  return {
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    year,
    month,
    day,
    hour: numberPart(parts, "hour"),
    minute: numberPart(parts, "minute"),
    second: numberPart(parts, "second"),
  };
}

function localTimeToUtc(dateKey: string, hour: number, timeZone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, 0, 0);
  let candidate = targetAsUtc;

  // Convert by repeatedly correcting the difference between the desired wall
  // clock and the wall clock represented by the current UTC candidate. This
  // also handles half-hour offsets and daylight-saving transitions.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const displayed = getZonedParts(new Date(candidate), timeZone);
    const displayedAsUtc = Date.UTC(
      displayed.year,
      displayed.month - 1,
      displayed.day,
      displayed.hour,
      displayed.minute,
      displayed.second,
    );
    const correction = targetAsUtc - displayedAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }

  return new Date(candidate);
}

export function getNextNotificationAt(now: Date, timeZone: string) {
  const local = getZonedParts(now, timeZone);
  const targetDate = local.hour < 20 ? local.dateKey : nextDateKey(local.dateKey);
  return localTimeToUtc(targetDate, 20, timeZone);
}

export function getFollowingNotificationAt(now: Date, timeZone: string) {
  const local = getZonedParts(now, timeZone);
  return localTimeToUtc(nextDateKey(local.dateKey), 20, timeZone);
}

export function getLocalDateKey(now: Date, timeZone: string) {
  return getZonedParts(now, timeZone).dateKey;
}
