"use client";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="admin-page">
      <section className="admin-panel admin-error-state" role="alert">
        <p className="eyebrow">Admin portal</p>
        <h1>We could not load this page</h1>
        <p>The problem was recorded without exposing private account data.</p>
        <button className="ui-button ui-button--primary" onClick={reset}>
          Try again
        </button>
      </section>
    </div>
  );
}
