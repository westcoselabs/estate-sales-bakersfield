import { PublicShell } from "@/components/shells/shells";
import { ListingGridSkeleton } from "@/features/search/listing-card";

export default function SearchLoading() {
  return (
    <PublicShell>
      <div className="explore-results-shell explore-results-shell--loading">
        <aside className="explore-filter-sidebar" aria-hidden="true">
          <span className="ui-skeleton explore-loading-filter-title" />
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index} className="ui-skeleton explore-loading-filter" />
          ))}
        </aside>
        <section className="explore-results-main" aria-busy="true">
          <span className="sr-only" role="status">
            Loading nearby sales...
          </span>
          <header className="explore-results-header" aria-hidden="true">
            <span className="ui-skeleton market-skeleton--title" />
            <span className="ui-skeleton explore-loading-toggle" />
          </header>
          <ListingGridSkeleton count={5} />
        </section>
      </div>
    </PublicShell>
  );
}
