"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icons";
import type { EventScheduleDay } from "@/modules/events";

import styles from "./event-schedule-editor.module.css";
import {
  calendarDateKey,
  dateFromKey,
  formatSaleDay,
  pacificLocalDateTime,
  toggleScheduleDay,
} from "./event-schedule-state";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function EventScheduleEditor({
  days,
  onChange,
  disabled,
}: {
  readonly days: readonly EventScheduleDay[];
  readonly onChange: (days: readonly EventScheduleDay[]) => void;
  readonly disabled: boolean;
}) {
  const [today] = useState(() =>
    pacificLocalDateTime(new Date().toISOString()).slice(0, 10),
  );
  const [month, setMonth] = useState(() => {
    const initial = dateFromKey(days[0]?.date ?? today);
    return new Date(
      Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1, 12),
    );
  });
  const calendarStart = new Date(month);
  calendarStart.setUTCDate(1 - month.getUTCDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setUTCDate(calendarStart.getUTCDate() + index);
    return day;
  });
  const selectedDates = new Set(days.map((day) => day.date));

  function changeMonth(offset: number) {
    setMonth(
      (current) =>
        new Date(
          Date.UTC(
            current.getUTCFullYear(),
            current.getUTCMonth() + offset,
            1,
            12,
          ),
        ),
    );
  }

  function updateTime(
    date: string,
    field: "startTime" | "endTime",
    value: string,
  ) {
    onChange(
      days.map((day) => (day.date === date ? { ...day, [field]: value } : day)),
    );
  }

  return (
    <div className={styles.editor}>
      <section
        className={`schedule-calendar ${styles.calendar}`}
        aria-label="Choose your sale dates"
      >
        <div className="schedule-calendar__header">
          <button
            type="button"
            className="schedule-calendar__nav schedule-calendar__nav--previous"
            aria-label="Previous month"
            onClick={() => changeMonth(-1)}
            disabled={disabled}
          >
            <Icon name="chevron" size={26} />
          </button>
          <h3 aria-live="polite">
            {new Intl.DateTimeFormat("en-US", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(month)}
          </h3>
          <button
            type="button"
            className="schedule-calendar__nav schedule-calendar__nav--next"
            aria-label="Next month"
            onClick={() => changeMonth(1)}
            disabled={disabled}
          >
            <Icon name="chevron" size={26} />
          </button>
        </div>
        <div className="schedule-calendar__weekdays" aria-hidden="true">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="schedule-calendar__days">
          {calendarDays.map((day) => {
            const date = calendarDateKey(day);
            const selected = selectedDates.has(date);
            return (
              <button
                key={date}
                type="button"
                className={[
                  "schedule-calendar__day",
                  day.getUTCMonth() !== month.getUTCMonth()
                    ? "is-outside-month"
                    : "",
                  date === today ? "is-today" : "",
                  selected ? "is-range-start is-range-end" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={formatSaleDay(date, true)}
                aria-pressed={selected}
                aria-current={date === today ? "date" : undefined}
                disabled={disabled}
                onClick={() => onChange(toggleScheduleDay(days, date))}
              >
                <span>{day.getUTCDate()}</span>
              </button>
            );
          })}
        </div>
      </section>
      <p className={styles.timezone}>
        All dates and times are in Pacific Time (US/Pacific).
      </p>
      <section className={styles.details} aria-label="Sale schedule details">
        <h3>Daily opening hours</h3>
        <p className={styles.hint}>
          Set a start and end time for each selected day. Select a date again to
          remove it.
        </p>
        {days.length ? (
          <ol className={styles.dayList}>
            {days.map((day) => (
              <li className={styles.dayRow} key={day.date}>
                <time dateTime={day.date}>{formatSaleDay(day.date)}</time>
                <label>
                  Start time
                  <input
                    type="time"
                    aria-label={`Start time for ${formatSaleDay(day.date, true)}`}
                    value={day.startTime}
                    required
                    disabled={disabled}
                    onChange={(event) =>
                      updateTime(day.date, "startTime", event.target.value)
                    }
                  />
                </label>
                <label>
                  End time
                  <input
                    type="time"
                    aria-label={`End time for ${formatSaleDay(day.date, true)}`}
                    value={day.endTime}
                    required
                    disabled={disabled}
                    onChange={(event) =>
                      updateTime(day.date, "endTime", event.target.value)
                    }
                  />
                </label>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${formatSaleDay(day.date, true)}`}
                  disabled={disabled}
                  onClick={() => onChange(toggleScheduleDay(days, day.date))}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.empty}>
            Select your sale dates on the calendar to add daily hours.
          </p>
        )}
        <p className="schedule-summary" role="status">
          {days.length
            ? `${days.length} sale ${days.length === 1 ? "day" : "days"} selected. Each day has its own opening and closing time.`
            : "No sale dates selected."}
        </p>
      </section>
    </div>
  );
}
