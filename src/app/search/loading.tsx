import { PublicShell } from "@/components/shells/shells";
import { ListingGridSkeleton } from "@/features/search/listing-card";

export default function SearchLoading() {
  return (
    <PublicShell>
      <div className="search-page" aria-busy="true">
        <span className="sr-only" role="status">
          Loading sale results
        </span>
        <header className="search-page__heading">
          <div>
            <p className="eyebrow">Bakersfield sale directory</p>
            <h1>Find estate sales and yard sales near you</h1>
            <p>Loading the next available sale results.</p>
          </div>
        </header>
        <div className="search-controls search-controls--skeleton">
          <span className="ui-skeleton" aria-hidden="true" />
        </div>
        <div className="search-results-heading" aria-hidden="true">
          <span className="ui-skeleton market-skeleton--title" />
        </div>
        <ListingGridSkeleton count={6} />
      </div>
    </PublicShell>
  );
}
