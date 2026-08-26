"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icons";
import {
  buildSearchHref,
  type PublicSearchCriteria,
  type PublicSearchIssue,
  type PublicSearchPage,
  type PublicSearchView,
} from "@/modules/public-search/client";

import { ExploreFilterSidebar, MobileFilterControls } from "./search-controls";
import { SearchResults } from "./search-results";

function ExploreViewToggle({
  view,
  className = "",
  onChange,
}: {
  readonly view: PublicSearchView;
  readonly className?: string;
  readonly onChange: (view: PublicSearchView) => void;
}) {
  return (
    <div
      className={`explore-view-toggle ${className}`.trim()}
      data-active={view}
      role="group"
      aria-label="Results view"
    >
      <button
        type="button"
        aria-pressed={view === "map"}
        onClick={() => onChange("map")}
      >
        <Icon name="map" size={20} />
        <span className="explore-view-toggle__label">Map View</span>
      </button>
      <button
        type="button"
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
      >
        <Icon name="list" size={20} />
        <span className="explore-view-toggle__label">List View</span>
      </button>
    </div>
  );
}

export function ExploreResultsShell({
  criteria,
  result,
  issue,
}: {
  readonly criteria: PublicSearchCriteria;
  readonly result: PublicSearchPage | null;
  readonly issue?: PublicSearchIssue | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<PublicSearchView>(criteria.view);
  const [mapVisited, setMapVisited] = useState(criteria.view === "map");
  const [lastSuccessfulResult, setLastSuccessfulResult] =
    useState<PublicSearchPage | null>(result);

  useEffect(() => {
    if (!result) return;
    // Keep the last valid result set visible if a later refresh fails.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastSuccessfulResult(result);
  }, [result]);

  useEffect(() => {
    function restoreView() {
      const restored = new URLSearchParams(window.location.search).get("view");
      const nextView: PublicSearchView = restored === "list" ? "list" : "map";
      setView(nextView);
      if (nextView === "map") setMapVisited(true);
    }
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, []);

  useEffect(() => {
    if (view !== "map") return;
    const mobileQuery = window.matchMedia("(max-width: 63.999rem)");
    if (!mobileQuery.matches) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll =
      document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior =
        previousHtmlOverscroll;
    };
  }, [view]);

  const navigate = useCallback(
    (changes: Partial<PublicSearchCriteria>) => {
      startTransition(() => {
        router.push(buildSearchHref({ ...criteria, view }, changes), {
          scroll: false,
        });
      });
    },
    [criteria, router, view],
  );

  function changeView(nextView: PublicSearchView) {
    if (nextView === view) return;
    setView(nextView);
    if (nextView === "map") setMapVisited(true);
    const href = buildSearchHref(
      { ...criteria, view },
      { view: nextView, cursor: null },
    );
    window.history.pushState({ exploreView: nextView }, "", href);
  }

  const shownResult = result ?? lastSuccessfulResult;
  const stale = !result && Boolean(lastSuccessfulResult) && !issue;
  const count = shownResult?.items.length ?? 0;
  const countLabel =
    count === 0
      ? "No sales shown"
      : `${String(count)} ${count === 1 ? "sale" : "sales"} shown`;

  return (
    <div className="explore-results-shell" data-view={view}>
      <ExploreFilterSidebar
        criteria={{ ...criteria, view }}
        pending={pending}
        onNavigate={navigate}
      />
      <section className="explore-results-main" aria-labelledby="explore-title">
        <MobileFilterControls
          criteria={{ ...criteria, view }}
          view={view}
          pending={pending}
          onNavigate={navigate}
        />
        <header className="explore-results-header">
          <h1 id="explore-title">{countLabel}</h1>
          <ExploreViewToggle view={view} onChange={changeView} />
        </header>
        <div
          className="explore-results-status"
          aria-live="polite"
          aria-atomic="true"
        >
          {pending ? <span>Updating results...</span> : null}
          {stale ? (
            <span className="explore-stale-message" role="alert">
              New results could not be loaded. Previous results are still shown.
              <button type="button" onClick={() => window.location.reload()}>
                Retry
              </button>
            </span>
          ) : null}
        </div>
        <SearchResults
          result={shownResult}
          issue={issue}
          criteria={{ ...criteria, view }}
          view={view}
          mapVisited={mapVisited}
          onClear={() =>
            navigate({ sale: "all", date: "all", from: null, to: null })
          }
        />
      </section>
      <ExploreViewToggle
        className="mobile-explore-dock"
        view={view}
        onChange={changeView}
      />
    </div>
  );
}
