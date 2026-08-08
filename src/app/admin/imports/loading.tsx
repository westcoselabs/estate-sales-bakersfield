export default function ListingImportsLoading() {
  return (
    <div className="admin-page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading listing imports</span>
      <div className="ui-skeleton admin-loading__heading" />
      <div className="admin-import-tabs admin-import-tabs--loading">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="ui-skeleton" key={index} />
        ))}
      </div>
      <div className="ui-skeleton admin-loading__panel" />
    </div>
  );
}
