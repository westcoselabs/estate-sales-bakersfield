export default function AdminLoading() {
  return (
    <div className="admin-page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading admin page</span>
      <div className="ui-skeleton admin-loading__heading" />
      <div className="admin-metric-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="ui-skeleton admin-loading__card" key={index} />
        ))}
      </div>
      <div className="ui-skeleton admin-loading__panel" />
    </div>
  );
}
