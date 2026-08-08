"use client";

export default function ListingImportsError({
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  return (
    <div className="admin-page">
      <section className="admin-panel admin-error-state" role="alert">
        <p className="eyebrow">Listing imports</p>
        <h1>The review queue could not be loaded</h1>
        <p>No candidate or credential information was exposed.</p>
        <button className="ui-button ui-button--primary" onClick={reset}>
          Try again
        </button>
      </section>
    </div>
  );
}
