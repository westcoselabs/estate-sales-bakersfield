"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

import { Icon } from "@/components/ui/icons";
import type {
  PublicDateFilter,
  PublicSaleFilter,
  PublicSearchCriteria,
} from "@/modules/public-search/client";
import { activeFilterCount } from "@/modules/public-search/client";

type NavigateSearch = (changes: Partial<PublicSearchCriteria>) => void;

const saleOptions: ReadonlyArray<{
  readonly value: PublicSaleFilter;
  readonly label: string;
}> = [
  { value: "all", label: "All sales" },
  { value: "estate", label: "Estate sales" },
  { value: "yard", label: "Yard sales" },
];

const dateOptions: ReadonlyArray<{
  readonly value: PublicDateFilter;
  readonly label: string;
}> = [
  { value: "all", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "weekend", label: "This weekend" },
  { value: "next-7-days", label: "Next 7 days" },
  { value: "custom", label: "Date range" },
];

const calendarWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateFromKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${String(date.getFullYear())}-${month}-${day}`;
}

function formatDate(value: string): string {
  const date = dateFromKey(value);
  return date
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(date)
    : "";
}

function PremiumSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<{
    readonly value: T;
    readonly label: string;
  }>;
  readonly onChange: (value: T) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="premium-select" data-open={open} ref={rootRef}>
      <span className="premium-select__label">{label}</span>
      <button
        className="premium-select__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <strong>{selectedLabel}</strong>
        <Icon name="chevron" size={18} />
      </button>
      {open ? (
        <div
          className="premium-select__menu"
          id={listId}
          role="listbox"
          aria-label={label}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <Icon name="check" size={16} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DateRangePicker({
  from,
  to,
  onChange,
  desktopPopover = false,
}: {
  readonly from: string;
  readonly to: string;
  readonly onChange: (from: string, to: string) => void;
  readonly desktopPopover?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | undefined>(
    undefined,
  );
  const [month, setMonth] = useState(() => {
    const selected = dateFromKey(from) ?? dateFromKey(to) ?? new Date();
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(1 - monthStart.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(calendarStart);
    day.setDate(calendarStart.getDate() + index);
    return day;
  });

  useEffect(() => {
    if (!open) return;

    function closeCalendar() {
      setOpen(false);
      setPopoverStyle(undefined);
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) closeCalendar();
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeCalendar();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function updateDesktopPopover() {
    if (!desktopPopover || typeof window === "undefined") {
      setPopoverStyle(undefined);
      return;
    }

    const trigger = triggerRef.current;
    if (!trigger) return;

    const margin = 16;
    const gap = 8;
    const calendarWidth = Math.min(336, window.innerWidth - margin * 2);
    const expectedCalendarHeight = 424;
    const rect = trigger.getBoundingClientRect();
    const left = Math.min(
      Math.max(rect.left, margin),
      window.innerWidth - calendarWidth - margin,
    );
    const top = Math.min(
      rect.bottom + gap,
      Math.max(margin, window.innerHeight - expectedCalendarHeight - margin),
    );

    setPopoverStyle({
      left,
      position: "fixed",
      top,
      width: calendarWidth,
    });
  }

  function toggleCalendar() {
    if (!open) {
      const selected = dateFromKey(from) ?? dateFromKey(to) ?? new Date();
      setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
      updateDesktopPopover();
    } else {
      setPopoverStyle(undefined);
    }
    setOpen((current) => !current);
  }

  function chooseDate(value: string) {
    if (!from || to) {
      onChange(value, "");
      return;
    }

    onChange(value < from ? value : from, value < from ? from : value);
    setOpen(false);
    setPopoverStyle(undefined);
  }

  const selectionLabel = from
    ? to
      ? `${formatDate(from)} – ${formatDate(to)}`
      : `${formatDate(from)} – Choose end date`
    : "Choose dates";

  return (
    <div className="premium-date-range" data-open={open} ref={rootRef}>
      <span className="premium-date-range__label">Date range</span>
      <button
        className="premium-date-range__trigger"
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggleCalendar}
      >
        <Icon name="calendar" size={18} />
        <strong>{selectionLabel}</strong>
        <Icon name="chevron" size={18} />
      </button>
      {open ? (
        <div
          className="premium-calendar"
          role="dialog"
          aria-label="Choose a date range"
          style={popoverStyle}
        >
          <div className="premium-calendar__header">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
            >
              <Icon name="chevron" size={18} />
            </button>
            <strong>
              {new Intl.DateTimeFormat("en-US", {
                month: "long",
                year: "numeric",
              }).format(month)}
            </strong>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
            >
              <Icon name="chevron" size={18} />
            </button>
          </div>
          <div className="premium-calendar__weekdays" aria-hidden="true">
            {calendarWeekdays.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="premium-calendar__days">
            {days.map((day) => {
              const value = dateKey(day);
              const isStart = value === from;
              const isEnd = value === to;
              const isInRange = Boolean(
                from && to && value > from && value < to,
              );
              const isCurrentMonth = day.getMonth() === month.getMonth();
              return (
                <button
                  key={value}
                  type="button"
                  className={[
                    !isCurrentMonth ? "is-outside-month" : "",
                    isStart ? "is-range-start" : "",
                    isEnd ? "is-range-end" : "",
                    isInRange ? "is-in-range" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={new Intl.DateTimeFormat("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  }).format(day)}
                  aria-pressed={isStart || isEnd}
                  onClick={() => chooseDate(value)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <div className="premium-calendar__footer">
            <button
              type="button"
              onClick={() => {
                onChange("", "");
                setOpen(false);
                setPopoverStyle(undefined);
              }}
            >
              Clear dates
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPopoverStyle(undefined);
              }}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ExploreFilterSidebar({
  criteria,
  pending,
  onNavigate,
}: {
  readonly criteria: PublicSearchCriteria;
  readonly pending: boolean;
  readonly onNavigate: NavigateSearch;
}) {
  const [from, setFrom] = useState(criteria.from ?? "");
  const [to, setTo] = useState(criteria.to ?? "");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrom(criteria.from ?? "");
    setTo(criteria.to ?? "");
  }, [criteria.from, criteria.to]);

  function applyDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to || from > to) return;
    onNavigate({ date: "custom", from, to });
  }

  return (
    <aside className="explore-filter-sidebar" aria-label="Search filters">
      <div className="explore-filter-sidebar__heading">
        <div>
          <span>Filters</span>
          <small>Bakersfield sales</small>
        </div>
        <button
          type="button"
          disabled={activeFilterCount(criteria) === 0 || pending}
          onClick={() =>
            onNavigate({ sale: "all", date: "all", from: null, to: null })
          }
        >
          Clear all
        </button>
      </div>
      <div className="explore-location-summary">
        <Icon name="pin" size={19} />
        <span>
          <small>Search area</small>
          <strong>Bakersfield, CA</strong>
        </span>
      </div>
      <div className="explore-filter-selects" aria-label="Filter choices">
        <PremiumSelect
          label="Sale type"
          value={criteria.sale}
          options={saleOptions}
          onChange={(sale) => onNavigate({ sale })}
        />
        <PremiumSelect
          label="When"
          value={criteria.date}
          options={dateOptions}
          onChange={(date) => onNavigate({ date, from: null, to: null })}
        />
      </div>
      <form className="explore-custom-dates" onSubmit={applyDates}>
        <fieldset>
          <legend>Date range</legend>
          <DateRangePicker
            from={from}
            to={to}
            desktopPopover
            onChange={(start, end) => {
              setFrom(start);
              setTo(end);
            }}
          />
          {from && to && from > to ? (
            <p className="ui-field-error" role="alert">
              End date must be on or after the start date.
            </p>
          ) : null}
          <button
            className="ui-button ui-button--secondary"
            type="submit"
            disabled={!from || !to || from > to || pending}
          >
            Apply dates
          </button>
        </fieldset>
      </form>
      <p className="explore-filter-note">
        Only published estate sales and yard sales are shown.
      </p>
    </aside>
  );
}

export function MobileFilterControls({
  criteria,
  view,
  pending,
  onNavigate,
}: {
  readonly criteria: PublicSearchCriteria;
  readonly view: "map" | "list";
  readonly pending: boolean;
  readonly onNavigate: NavigateSearch;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draftSale, setDraftSale] = useState(criteria.sale);
  const [draftDate, setDraftDate] = useState(criteria.date);
  const [from, setFrom] = useState(criteria.from ?? "");
  const [to, setTo] = useState(criteria.to ?? "");
  const count = activeFilterCount(criteria);

  function openFilters() {
    setDraftSale(criteria.sale);
    setDraftDate(criteria.date);
    setFrom(criteria.from ?? "");
    setTo(criteria.to ?? "");
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function closeFilters() {
    dialogRef.current?.close();
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftDate === "custom" && (!from || !to || from > to)) return;
    closeFilters();
    onNavigate({
      sale: draftSale,
      date: draftDate,
      from: draftDate === "custom" ? from : null,
      to: draftDate === "custom" ? to : null,
    });
  }

  return (
    <>
      <div className="explore-mobile-toolbar">
        <button
          className="search-filter-trigger"
          type="button"
          ref={triggerRef}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={openFilters}
        >
          <Icon name="settings" size={19} />
          Filters
          {count > 0 ? (
            <span aria-label={`${String(count)} active filters`}>{count}</span>
          ) : null}
        </button>
        {view === "list" ? (
          <label className="explore-sort-control">
            <span className="sr-only">Sort results</span>
            <select
              aria-label="Sort results"
              value="soonest"
              onChange={() => {}}
            >
              <option value="soonest">Sort: Soonest</option>
            </select>
            <Icon name="chevron" size={18} />
          </label>
        ) : null}
      </div>
      <dialog
        className="search-filter-sheet"
        ref={dialogRef}
        aria-labelledby="search-filter-title"
        onCancel={(event) => {
          event.preventDefault();
          closeFilters();
        }}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={applyFilters}>
          <div className="search-filter-sheet__header">
            <div>
              <small>Bakersfield search</small>
              <h2 id="search-filter-title">Filter sales</h2>
            </div>
            <button
              type="button"
              aria-label="Close filters"
              onClick={closeFilters}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="search-filter-sheet__body">
            <div className="explore-location-summary">
              <Icon name="pin" size={19} />
              <span>
                <small>Search area</small>
                <strong>Bakersfield, CA</strong>
              </span>
            </div>
            <div
              className="search-filter-sheet__selects"
              aria-label="Filter choices"
            >
              <PremiumSelect
                label="Sale type"
                value={draftSale}
                options={saleOptions}
                onChange={setDraftSale}
              />
              <PremiumSelect
                label="When"
                value={draftDate}
                options={dateOptions}
                onChange={(date) => {
                  setDraftDate(date);
                  if (date !== "custom") {
                    setFrom("");
                    setTo("");
                  }
                }}
              />
            </div>
            {draftDate === "custom" ? (
              <fieldset className="explore-filter-group explore-filter-group--custom">
                <legend>Date range</legend>
                <div className="search-custom-dates">
                  <DateRangePicker
                    from={from}
                    to={to}
                    onChange={(start, end) => {
                      setFrom(start);
                      setTo(end);
                    }}
                  />
                  {from && to && from > to ? (
                    <p className="ui-field-error" role="alert">
                      End date must be on or after the start date.
                    </p>
                  ) : null}
                </div>
              </fieldset>
            ) : null}
          </div>
          <div className="search-filter-sheet__actions">
            <button
              type="button"
              disabled={
                draftSale === "all" && draftDate === "all" && !from && !to
              }
              onClick={() => {
                setDraftSale("all");
                setDraftDate("all");
                setFrom("");
                setTo("");
              }}
            >
              Clear all
            </button>
            <button
              className="ui-button ui-button--primary"
              type="submit"
              disabled={
                pending ||
                (draftDate === "custom" && (!from || !to || from > to))
              }
            >
              Apply filters
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
