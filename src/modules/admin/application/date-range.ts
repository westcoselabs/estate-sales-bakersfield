import type { AdminDateRange, AdminDateRangeKey } from "../domain/types";

export const REPORTING_TIMEZONE = "America/Los_Angeles";

const labels: Record<AdminDateRangeKey, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  year: "This year",
  all: "All time",
};

function partsAt(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORTING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function localMidnight(year: number, month: number, day: number): Date {
  const desired = Date.UTC(year, month - 1, day);
  let instant = new Date(desired);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = partsAt(instant);
    const rendered = Date.UTC(
      Number(actual.year),
      Number(actual.month) - 1,
      Number(actual.day),
      Number(actual.hour),
      Number(actual.minute),
      Number(actual.second),
    );
    instant = new Date(instant.getTime() + desired - rendered);
  }
  return instant;
}

export function adminDateRange(
  key: AdminDateRangeKey,
  now = new Date(),
): AdminDateRange {
  const local = partsAt(now);
  const year = Number(local.year);
  const month = Number(local.month);
  const day = Number(local.day);
  let from: Date | null;
  let bucket: AdminDateRange["bucket"];

  if (key === "all") {
    from = null;
    bucket = "month";
  } else if (key === "year") {
    from = localMidnight(year, 1, 1);
    bucket = "month";
  } else {
    const subtract = key === "today" ? 0 : key === "7d" ? 6 : 29;
    const localDate = new Date(Date.UTC(year, month - 1, day - subtract));
    from = localMidnight(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth() + 1,
      localDate.getUTCDate(),
    );
    bucket = key === "today" ? "hour" : "day";
  }

  return { key, label: labels[key], from, to: now, bucket };
}

export function parseAdminDateRange(
  value: string | undefined,
): AdminDateRangeKey {
  return ["today", "7d", "30d", "year", "all"].includes(value ?? "")
    ? (value as AdminDateRangeKey)
    : "30d";
}

export function trendBucket(
  date: Date,
  bucket: AdminDateRange["bucket"],
): { key: string; label: string } {
  const options: Intl.DateTimeFormatOptions =
    bucket === "hour"
      ? { hour: "numeric" }
      : bucket === "day"
        ? { month: "short", day: "numeric" }
        : { month: "short", year: "numeric" };
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORTING_TIMEZONE,
    ...options,
  }).format(date);
  const parts = partsAt(date);
  const key =
    bucket === "hour"
      ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}`
      : bucket === "day"
        ? `${parts.year}-${parts.month}-${parts.day}`
        : `${parts.year}-${parts.month}`;
  return { key, label };
}
