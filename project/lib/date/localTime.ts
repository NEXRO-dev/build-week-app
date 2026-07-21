export type ZonedNow = {
  dateKey: string;
  hour: number;
  label: string;
  timeZone: string;
};

function numericPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) {
  return Number(parts.find((part) => part.type === type)?.value ?? 0);
}

export function resolveBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
}

export function getZonedNow(
  date = new Date(),
  timeZone = resolveBrowserTimeZone(),
  locale: "jp-ja" | "us-en" = "jp-ja",
): ZonedNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const year = numericPart(parts, "year");
  const month = numericPart(parts, "month");
  const day = numericPart(parts, "day");

  return {
    dateKey: [year, month, day].map((value, index) =>
      index === 0 ? String(value) : String(value).padStart(2, "0"),
    ).join("-"),
    hour: numericPart(parts, "hour"),
    label: new Intl.DateTimeFormat(locale === "us-en" ? "en-US" : "ja-JP", {
      timeZone,
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(date),
    timeZone,
  };
}

export function nextDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function isReflectionWindowOpen(now: ZonedNow) {
  return now.hour >= 20;
}
