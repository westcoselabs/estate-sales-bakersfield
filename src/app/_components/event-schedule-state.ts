import type { EventEditorDto, EventScheduleDay } from "@/modules/events";

export const SALE_TIMEZONE = "America/Los_Angeles";

export function calendarDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dateFromKey(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

export function formatSaleDay(value: string, full = false): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: full ? "long" : "short",
    month: full ? "long" : "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateFromKey(value));
}

export function formatSaleTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`2000-01-01T${value}:00.000Z`));
}

export function pacificLocalDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SALE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** Older drafts only stored their first opening and final closing time. */
export function editorScheduleDays(
  event: Pick<EventEditorDto, "scheduleDays" | "localStartsAt" | "localEndsAt">,
): readonly EventScheduleDay[] {
  if (event.scheduleDays?.length) {
    return [...event.scheduleDays].sort((a, b) => a.date.localeCompare(b.date));
  }
  if (!event.localStartsAt || !event.localEndsAt) return [];
  const startDate = event.localStartsAt.slice(0, 10);
  const endDate = event.localEndsAt.slice(0, 10);
  const cursor = dateFromKey(startDate);
  const finalDate = dateFromKey(endDate);
  if (
    !Number.isFinite(cursor.getTime()) ||
    !Number.isFinite(finalDate.getTime())
  ) {
    return [];
  }
  const days: EventScheduleDay[] = [];
  while (cursor <= finalDate && days.length < 366) {
    days.push({
      date: calendarDateKey(cursor),
      startTime: event.localStartsAt.slice(11, 16),
      endTime: event.localEndsAt.slice(11, 16),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function toggleScheduleDay(
  days: readonly EventScheduleDay[],
  date: string,
): readonly EventScheduleDay[] {
  if (days.some((day) => day.date === date)) {
    return days.filter((day) => day.date !== date);
  }
  const lastDay = days.at(-1);
  return [
    ...days,
    {
      date,
      startTime: lastDay?.startTime ?? "08:00",
      endTime: lastDay?.endTime ?? "13:00",
    },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

export function scheduleValidationMessage(
  days: readonly EventScheduleDay[],
): string | null {
  if (!days.length)
    return "Select at least one sale date, then set its start and end time.";
  for (const day of days) {
    if (!day.startTime || !day.endTime) {
      return `Enter a start and end time for ${formatSaleDay(day.date)}.`;
    }
    if (day.endTime <= day.startTime) {
      return `The end time on ${formatSaleDay(day.date)} must be after its start time.`;
    }
  }
  return null;
}

export function editorAddressRevealAt(
  event: Pick<
    EventEditorDto,
    "localAddressRevealAt" | "addressRevealAt" | "localStartsAt"
  >,
): string {
  return (
    event.localAddressRevealAt ??
    (event.addressRevealAt
      ? pacificLocalDateTime(event.addressRevealAt)
      : (event.localStartsAt ?? ""))
  );
}
