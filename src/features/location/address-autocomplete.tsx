"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export interface ClientAddressSuggestion {
  readonly id: string;
  readonly formattedAddress: string;
  readonly houseNumber: string;
  readonly street: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country: string;
  readonly countryCode: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly confidence: number | null;
  readonly matchType: string | null;
  readonly provider: {
    readonly name: "geoapify" | "test-fixture";
    readonly version: string;
    readonly attribution: string;
  };
  readonly selectionToken: string;
}

type SearchState =
  "idle" | "loading" | "ready" | "empty" | "unavailable" | "rate-limited";

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSelect: (suggestion: ClientAddressSuggestion) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<
    readonly ClientAddressSuggestion[]
  >([]);
  const [state, setState] = useState<SearchState>("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 4) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState("loading");
      void fetch(`/api/locations/autocomplete?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      })
        .then(async (response) => {
          const payload = (await response.json()) as {
            readonly suggestions?: readonly ClientAddressSuggestion[];
            readonly error?: { readonly code?: string };
          };
          if (response.status === 429) {
            setState("rate-limited");
            setSuggestions([]);
            return;
          }
          if (!response.ok || !payload.suggestions) {
            setState("unavailable");
            setSuggestions([]);
            return;
          }
          setSuggestions(payload.suggestions);
          setState(payload.suggestions.length ? "ready" : "empty");
          setActiveIndex(payload.suggestions.length ? 0 : -1);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setState("unavailable");
            setSuggestions([]);
          }
        });
    }, 325);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [requestVersion, value]);

  function choose(suggestion: ClientAddressSuggestion) {
    onSelect(suggestion);
    setSuggestions([]);
    setState("idle");
    setActiveIndex(-1);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (current) => (current - 1 + suggestions.length) % suggestions.length,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]!);
    } else if (event.key === "Escape") {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  }

  const status =
    state === "loading"
      ? "Searching addresses..."
      : state === "empty"
        ? "No matching Bakersfield-area address was found."
        : state === "unavailable"
          ? "Address search is unavailable. You can save this draft and try again."
          : state === "rate-limited"
            ? "Too many address searches. Wait a moment and retry."
            : "";

  return (
    <div className="address-combobox">
      <label htmlFor={`${listId}-input`}>
        Search the sale property address
      </label>
      <input
        id={`${listId}-input`}
        ref={inputRef}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (nextValue.trim().length < 4) {
            setSuggestions([]);
            setState("idle");
            setActiveIndex(-1);
          }
          onChange(nextValue);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={suggestions.length > 0}
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-${String(activeIndex)}` : undefined
        }
        autoComplete="off"
        placeholder="Start with the street number and name"
      />
      <p className="ui-field-help">
        Choose a structured suggestion before confirming the map pin.
      </p>
      {suggestions.length ? (
        <ul id={listId} role="listbox" className="address-suggestions">
          {suggestions.map((suggestion, index) => (
            <li
              id={`${listId}-${String(index)}`}
              role="option"
              aria-selected={activeIndex === index}
              key={suggestion.id}
            >
              <button type="button" onClick={() => choose(suggestion)}>
                <strong>{suggestion.formattedAddress}</strong>
                <span>Bakersfield service area</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="address-combobox__status" aria-live="polite">
        {status}
      </p>
      {state === "unavailable" || state === "rate-limited" ? (
        <button
          className="address-combobox__retry"
          type="button"
          onClick={() => setRequestVersion((version) => version + 1)}
        >
          Retry address search
        </button>
      ) : null}
    </div>
  );
}
