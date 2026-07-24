"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icons";
import { Button, IconButton } from "@/components/ui/primitives";
import {
  activeFilterCount,
  buildSearchHref,
  dateFilterLabel,
  type PublicDateFilter,
  type PublicSaleFilter,
  type PublicSearchCriteria,
} from "@/modules/public-search/client";

const saleOptions: ReadonlyArray<{
  readonly value: PublicSaleFilter;
  readonly label: string;
}> = [
  { value: "all", label: "All sales" },
  { value: "estate", label: "Estate sales" },
  { value: "yard", label: "Yard sales" },
];

const dateOptions: ReadonlyArray<{
  readonly value: Exclude<PublicDateFilter, "all" | "custom">;
  readonly label: string;
}> = [
  { value: "today", label: "Today" },
  { value: "weekend", label: "This weekend" },
  { value: "next-7-days", label: "Next 7 days" },
];

export function SearchControls({
  criteria,
}: {
  readonly criteria: PublicSearchCriteria;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [customFrom, setCustomFrom] = useState(criteria.from ?? "");
  const [customTo, setCustomTo] = useState(criteria.to ?? "");
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    // The date inputs retain local edits while the sheet is open, but must
    // immediately reflect URL criteria after Back/Forward navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomFrom(criteria.from ?? "");
    setCustomTo(criteria.to ?? "");
  }, [criteria.from, criteria.to]);

  function navigate(changes: Partial<PublicSearchCriteria>) {
    startTransition(() => {
      router.push(buildSearchHref(criteria, changes), { scroll: false });
    });
  }

  function openFilters() {
    setSheetOpen(true);
    dialogRef.current?.showModal();
  }

  function closeFilters() {
    dialogRef.current?.close();
    setSheetOpen(false);
    requestAnimationFrame(() => filterTriggerRef.current?.focus());
  }

  function applyCustomDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customFrom || !customTo || customFrom > customTo) return;
    closeFilters();
    navigate({
      date: "custom",
      from: customFrom,
      to: customTo,
    });
  }

  const activeDate = dateFilterLabel(criteria);
  const count = activeFilterCount(criteria);

  return (
    <section className="search-controls" aria-label="Search controls">
      <div className="search-controls__topline">
        <div
          className="search-view-toggle"
          aria-label="Results view"
          role="group"
        >
          <button
            type="button"
            aria-pressed={criteria.view === "list"}
            onClick={() => navigate({ view: "list" })}
          >
            <Icon name="list" size={19} />
            List
          </button>
          <button
            type="button"
            aria-pressed={criteria.view === "map"}
            onClick={() => navigate({ view: "map" })}
          >
            <Icon name="map" size={19} />
            Map
          </button>
        </div>
        <button
          className="search-filter-trigger"
          type="button"
          ref={filterTriggerRef}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={openFilters}
        >
          <Icon name="settings" size={19} />
          Filters
          {count > 0 ? (
            <span aria-label={`${String(count)} active filters`}>{count}</span>
          ) : null}
        </button>
      </div>

      <div className="search-controls__desktop" aria-label="Quick filters">
        <div className="search-segmented" role="group" aria-label="Sale type">
          {saleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={criteria.sale === option.value}
              onClick={() => navigate({ sale: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div
          className="search-date-presets"
          role="group"
          aria-label="Sale date"
        >
          {dateOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={criteria.date === option.value}
              onClick={() =>
                navigate({ date: option.value, from: null, to: null })
              }
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={criteria.date === "custom"}
            onClick={openFilters}
          >
            <Icon name="calendar" size={18} />
            {criteria.date === "custom" && activeDate
              ? activeDate
              : "Choose dates"}
          </button>
        </div>
      </div>

      {count > 0 ? (
        <div className="search-active-filters" aria-label="Active filters">
          {criteria.sale !== "all" ? (
            <button type="button" onClick={() => navigate({ sale: "all" })}>
              {criteria.sale === "estate" ? "Estate sales" : "Yard sales"}
              <Icon name="close" size={15} />
              <span className="sr-only">Remove sale type filter</span>
            </button>
          ) : null}
          {activeDate ? (
            <button
              type="button"
              onClick={() => navigate({ date: "all", from: null, to: null })}
            >
              {activeDate}
              <Icon name="close" size={15} />
              <span className="sr-only">Remove date filter</span>
            </button>
          ) : null}
          {count > 1 ? (
            <button
              className="search-clear-filters"
              type="button"
              onClick={() =>
                navigate({
                  sale: "all",
                  date: "all",
                  from: null,
                  to: null,
                })
              }
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}

      <p
        className="search-updating"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {pending ? "Updating results..." : ""}
      </p>

      <dialog
        className="search-filter-sheet"
        ref={dialogRef}
        aria-labelledby="search-filter-title"
        onCancel={() => setSheetOpen(false)}
        onClose={() => setSheetOpen(false)}
      >
        <div className="search-filter-sheet__header">
          <div>
            <p className="eyebrow">Bakersfield search</p>
            <h2 id="search-filter-title">Filter sales</h2>
          </div>
          <IconButton label="Close filters" onClick={closeFilters}>
            <Icon name="close" />
          </IconButton>
        </div>
        <div className="search-filter-sheet__body">
          <fieldset>
            <legend>Sale type</legend>
            <div className="search-filter-options">
              {saleOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={criteria.sale === option.value}
                  onClick={() => {
                    closeFilters();
                    navigate({ sale: option.value });
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>When</legend>
            <div className="search-filter-options">
              <button
                type="button"
                aria-pressed={criteria.date === "all"}
                onClick={() => {
                  closeFilters();
                  navigate({ date: "all", from: null, to: null });
                }}
              >
                All upcoming
              </button>
              {dateOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={criteria.date === option.value}
                  onClick={() => {
                    closeFilters();
                    navigate({
                      date: option.value,
                      from: null,
                      to: null,
                    });
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <form className="search-custom-dates" onSubmit={applyCustomDates}>
            <fieldset>
              <legend>Custom date range</legend>
              <p>
                Choose an inclusive range using Bakersfield local calendar
                dates.
              </p>
              <div>
                <label htmlFor="search-from">
                  Start date
                  <input
                    id="search-from"
                    type="date"
                    value={customFrom}
                    onChange={(event) => setCustomFrom(event.target.value)}
                  />
                </label>
                <label htmlFor="search-to">
                  End date
                  <input
                    id="search-to"
                    type="date"
                    min={customFrom || undefined}
                    value={customTo}
                    onChange={(event) => setCustomTo(event.target.value)}
                  />
                </label>
              </div>
              {customFrom && customTo && customFrom > customTo ? (
                <p className="ui-field-error" role="alert">
                  End date must be on or after the start date.
                </p>
              ) : null}
            </fieldset>
            <div className="search-filter-sheet__actions">
              <Button type="button" variant="secondary" onClick={closeFilters}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !customFrom || !customTo || customFrom > customTo || pending
                }
              >
                Apply dates
              </Button>
            </div>
          </form>
        </div>
      </dialog>
    </section>
  );
}
