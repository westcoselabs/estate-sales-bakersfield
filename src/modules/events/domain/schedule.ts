import { EventValidationError } from "./errors";
import type { EventScheduleDay, PublicEventScheduleDay } from "./types";

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

interface LocalParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

const formatterByTimezone = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const existing = formatterByTimezone.get(timezone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  formatterByTimezone.set(timezone, formatter);
  return formatter;
}

function parseLocal(value: string): LocalParts {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match)
    throw new EventValidationError("Use a complete local date and time.");
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const check = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  );
  if (
    check.getUTCFullYear() !== parts.year ||
    check.getUTCMonth() + 1 !== parts.month ||
    check.getUTCDate() !== parts.day ||
    check.getUTCHours() !== parts.hour ||
    check.getUTCMinutes() !== parts.minute
  ) {
    throw new EventValidationError("The local date or time is invalid.");
  }
  return parts;
}

function formattedParts(date: Date, timezone: string): LocalParts {
  const formatter = formatterFor(timezone);
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
  };
}

function sameParts(left: LocalParts, right: LocalParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

export function assertIanaTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new EventValidationError("Select a valid IANA timezone.");
  }
}

export function localDateTimeToUtc(value: string, timezone: string): Date {
  assertIanaTimezone(timezone);
  const local = parseLocal(value);
  const naive = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  const matches: number[] = [];
  for (
    let offsetMinutes = -14 * 60;
    offsetMinutes <= 14 * 60;
    offsetMinutes += 15
  ) {
    const candidate = naive - offsetMinutes * 60_000;
    if (sameParts(formattedParts(new Date(candidate), timezone), local)) {
      matches.push(candidate);
    }
  }
  const unique = [...new Set(matches)];
  if (unique.length === 0) {
    throw new EventValidationError(
      "That local time does not exist in the selected timezone.",
    );
  }
  if (unique.length > 1) {
    throw new EventValidationError(
      "That local time is ambiguous because of daylight-saving time. Choose another time.",
    );
  }
  return new Date(unique[0] as number);
}

export function validatedSchedule(input: {
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly timezone: string;
}): { readonly startsAt: Date; readonly endsAt: Date } {
  const startsAt = localDateTimeToUtc(input.localStartsAt, input.timezone);
  const endsAt = localDateTimeToUtc(input.localEndsAt, input.timezone);
  if (endsAt <= startsAt) {
    throw new EventValidationError("The event must end after it starts.");
  }
  return { startsAt, endsAt };
}

export function utcToLocalDateTime(value: Date, timezone: string): string {
  const parts = formattedParts(value, timezone);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${String(parts.year).padStart(4, "0")}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function validatedScheduleDays(
  days: readonly EventScheduleDay[],
  timezone: string,
): readonly PublicEventScheduleDay[] {
  if (days.length === 0 || days.length > 366) {
    throw new EventValidationError("Select between 1 and 366 event dates.");
  }
  const dates = new Set<string>();
  return [...days]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((day) => {
      if (dates.has(day.date)) {
        throw new EventValidationError("Each event date can only appear once.");
      }
      dates.add(day.date);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(day.date) ||
        !/^\d{2}:\d{2}$/.test(day.startTime) ||
        !/^\d{2}:\d{2}$/.test(day.endTime)
      ) {
        throw new EventValidationError(
          "Use a complete date and opening and closing times for each day.",
        );
      }
      if (day.endTime <= day.startTime) {
        throw new EventValidationError(
          "Each day's closing time must be after its opening time on the same day.",
        );
      }
      const schedule = validatedSchedule({
        localStartsAt: `${day.date}T${day.startTime}`,
        localEndsAt: `${day.date}T${day.endTime}`,
        timezone,
      });
      return {
        date: day.date,
        startTime: day.startTime,
        endTime: day.endTime,
        startsAt: schedule.startsAt.toISOString(),
        endsAt: schedule.endsAt.toISOString(),
      };
    });
}

/** Accepts stored JSON without inventing daily opening hours for legacy events. */
export function readScheduleDays(
  value: unknown,
): readonly EventScheduleDay[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (
    !value.every(
      (day) =>
        day &&
        typeof day === "object" &&
        typeof day.date === "string" &&
        typeof day.startTime === "string" &&
        typeof day.endTime === "string",
    )
  )
    return null;
  return value.map((day: EventScheduleDay) => ({
    date: day.date,
    startTime: day.startTime,
    endTime: day.endTime,
  }));
}
