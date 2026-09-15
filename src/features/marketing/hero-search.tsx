"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icons";

const dateOptions = [
  {
    value: "all",
    label: "All upcoming dates",
    detail: "See every upcoming sale",
  },
  { value: "today", label: "Today", detail: "Find a sale to visit today" },
  {
    value: "weekend",
    label: "This weekend",
    detail: "Plan your weekend stops",
  },
  {
    value: "next-7-days",
    label: "Next 7 days",
    detail: "Look ahead to the coming week",
  },
] as const;

export function HeroSearch() {
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState({
    above: false,
    height: 320,
  });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    options.current[selected]?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open, selected]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function openMenu() {
    const box = trigger.current?.getBoundingClientRect();
    if (box) {
      const below = window.innerHeight - box.bottom - 16;
      const above = box.top - 16;
      const opensAbove = below < 280 && above > below;
      setMenuPlacement({
        above: opensAbove,
        height: Math.max(96, opensAbove ? above : below),
      });
    }
    setOpen(true);
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (index + 1) % dateOptions.length;
    if (event.key === "ArrowUp")
      next = (index + dateOptions.length - 1) % dateOptions.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = dateOptions.length - 1;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key.length === 1 && event.key !== " ") {
      const match = dateOptions.findIndex(
        (option, candidate) =>
          candidate > index &&
          option.label.toLowerCase().startsWith(event.key.toLowerCase()),
      );
      next =
        match >= 0
          ? match
          : dateOptions.findIndex((option) =>
              option.label.toLowerCase().startsWith(event.key.toLowerCase()),
            );
    }
    if (next !== undefined && next >= 0) {
      event.preventDefault();
      options.current[next]?.focus();
    }
  }

  return (
    <form
      className="home-hero__search"
      action="/search"
      method="get"
      aria-label="Find sales by date"
    >
      <input type="hidden" name="date" value={dateOptions[selected]!.value} />
      <div
        className="hero-date-picker"
        ref={root}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setOpen(false);
        }}
      >
        <button
          ref={trigger}
          className="hero-date-picker__trigger"
          type="button"
          aria-label={`Sale dates: ${selected === 0 ? "Select date" : dateOptions[selected]!.label}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              openMenu();
            }
          }}
        >
          <Icon name="calendar" size={20} />
          <span>
            {selected === 0 ? "Select date" : dateOptions[selected]!.label}
          </span>
          <Icon name="chevron" size={16} />
        </button>
        {open ? (
          <div
            className="hero-date-picker__menu"
            data-above={menuPlacement.above}
            style={{ maxHeight: menuPlacement.height }}
            id={listId}
            role="listbox"
            aria-label="Sale dates"
          >
            {dateOptions.map((option, index) => (
              <button
                key={option.value}
                ref={(element) => {
                  options.current[index] = element;
                }}
                className="hero-date-picker__option"
                type="button"
                role="option"
                aria-selected={selected === index}
                tabIndex={selected === index ? 0 : -1}
                onKeyDown={(event) => navigate(event, index)}
                onClick={() => {
                  setSelected(index);
                  close();
                }}
              >
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.detail}</small>
                </span>
                {selected === index ? <Icon name="check" size={18} /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button type="submit" aria-label="Search sales">
        <Icon name="search" size={21} />
        <span>Search</span>
      </button>
    </form>
  );
}
