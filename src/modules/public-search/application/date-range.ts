import type { PublicSearchCriteria } from "../domain/types";

export const BAKERSFIELD_TIMEZONE = "America/Los_Angeles";

interface CalendarParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function parseCalendarDate(value: string): CalendarParts {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Invalid calendar date");
  return { year, month, day };
}

function calendarDate(parts: CalendarParts): string {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function addDays(value: string, days: number): string {
  const parts = parseCalendarDate(value);
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );
  return calendarDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function localDateAt(date: Date, timezone: string): string {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function localMidnightToUtc(value: string, timezone: string): Date {
  const parts = parseCalendarDate(value);
  const target = `${value}T00:00`;
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day);
  for (
    let offsetMinutes = -14 * 60;
    offsetMinutes <= 14 * 60;
    offsetMinutes += 15
  ) {
    const candidate = new Date(naive - offsetMinutes * 60_000);
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(candidate)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    if (
      `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}` ===
      target
    ) {
      return candidate;
    }
  }
  throw new Error("Could not resolve the Bakersfield calendar boundary");
}

export interface PublicDateInterval {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export function resolvePublicDateInterval(
  criteria: PublicSearchCriteria,
  now: Date,
): PublicDateInterval | null {
  if (criteria.date === "all") return null;
  const today = localDateAt(now, BAKERSFIELD_TIMEZONE);
  let from = today;
  let endExclusive = addDays(today, 1);

  if (criteria.date === "tomorrow") {
    from = addDays(today, 1);
    endExclusive = addDays(from, 1);
  } else if (criteria.date === "weekend") {
    const parts = parseCalendarDate(today);
    const weekday = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day),
    ).getUTCDay();
    const daysUntilFriday = weekday >= 1 && weekday <= 4 ? 5 - weekday : 0;
    from = addDays(today, daysUntilFriday);
    if (weekday === 6) endExclusive = addDays(today, 2);
    else if (weekday === 0) endExclusive = addDays(today, 1);
    else endExclusive = addDays(from, 3);
  } else if (criteria.date === "next-7-days") {
    endExclusive = addDays(today, 7);
  } else if (criteria.date === "custom") {
    if (!criteria.from || !criteria.to || criteria.from > criteria.to) {
      throw new Error("A valid custom date range is required");
    }
    from = criteria.from;
    endExclusive = addDays(criteria.to, 1);
  }

  return {
    startsAt: localMidnightToUtc(from, BAKERSFIELD_TIMEZONE),
    endsAt: localMidnightToUtc(endExclusive, BAKERSFIELD_TIMEZONE),
  };
}
