"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Icon } from "@/components/ui/icons";
import type {
  PublicDateFilter,
  PublicSaleFilter,
  PublicSearchCriteria,
} from "@/modules/public-search/client";
import {
  activeFilterCount,
  dateFilterLabel,
} from "@/modules/public-search/client";

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
  readonly value: Exclude<PublicDateFilter, "custom">;
  readonly label: string;
}> = [
  { value: "all", label: "All upcoming" },
  { value: "today", label: "Today" },
  { value: "weekend", label: "This weekend" },
  { value: "next-7-days", label: "Next 7 days" },
];

function FilterOptionGroups({
  sale,
  date,
  onSale,
  onDate,
}: {
  readonly sale: PublicSaleFilter;
  readonly date: PublicDateFilter;
  readonly onSale: (value: PublicSaleFilter) => void;
  readonly onDate: (value: PublicDateFilter) => void;
}) {
  return (
    <>
      <fieldset className="explore-filter-group">
        <legend>Sale type</legend>
        <div className="explore-filter-options">
          {saleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={sale === option.value}
              onClick={() => onSale(option.value)}
            >
              <span aria-hidden="true" />
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="explore-filter-group">
        <legend>Date</legend>
        <div className="explore-date-options">
          {dateOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={date === option.value}
              onClick={() => onDate(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
    </>
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
      <FilterOptionGroups
        sale={criteria.sale}
        date={criteria.date}
        onSale={(sale) => onNavigate({ sale })}
        onDate={(date) => onNavigate({ date, from: null, to: null })}
      />
      <form className="explore-custom-dates" onSubmit={applyDates}>
        <fieldset>
          <legend>Custom dates</legend>
          <div>
            <label htmlFor="desktop-search-from">
              Start date
              <input
                id="desktop-search-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label htmlFor="desktop-search-to">
              End date
              <input
                id="desktop-search-to"
                type="date"
                min={from || undefined}
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
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
            <FilterOptionGroups
              sale={draftSale}
              date={draftDate}
              onSale={setDraftSale}
              onDate={(date) => {
                setDraftDate(date);
                if (date !== "custom") {
                  setFrom("");
                  setTo("");
                }
              }}
            />
            <fieldset className="explore-filter-group explore-filter-group--custom">
              <legend>Custom dates</legend>
              <button
                type="button"
                aria-pressed={draftDate === "custom"}
                onClick={() => setDraftDate("custom")}
              >
                <Icon name="calendar" size={18} />
                {draftDate === "custom"
                  ? (dateFilterLabel({
                      ...criteria,
                      date: draftDate,
                      from,
                      to,
                    }) ?? "Choose dates")
                  : "Choose dates"}
              </button>
              {draftDate === "custom" ? (
                <div className="search-custom-dates">
                  <label htmlFor="search-from">
                    Start date
                    <input
                      id="search-from"
                      type="date"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                    />
                  </label>
                  <label htmlFor="search-to">
                    End date
                    <input
                      id="search-to"
                      type="date"
                      min={from || undefined}
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                    />
                  </label>
                  {from && to && from > to ? (
                    <p className="ui-field-error" role="alert">
                      End date must be on or after the start date.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
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
