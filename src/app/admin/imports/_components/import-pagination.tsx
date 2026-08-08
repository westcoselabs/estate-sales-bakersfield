import Link from "next/link";

export function ImportPagination({
  view,
  nextCursor,
  shown,
}: {
  readonly view: string;
  readonly nextCursor: string | null;
  readonly shown: number;
}) {
  return (
    <div className="admin-pagination">
      <span>{shown === 1 ? "1 record shown" : `${shown} records shown`}</span>
      <div className="admin-actions">
        <Link
          className="ui-button ui-button--secondary"
          href={`/admin/imports?view=${encodeURIComponent(view)}`}
        >
          First page
        </Link>
        {nextCursor ? (
          <Link
            className="ui-button ui-button--secondary"
            href={`/admin/imports?view=${encodeURIComponent(view)}&cursor=${encodeURIComponent(nextCursor)}`}
          >
            Next page
          </Link>
        ) : null}
      </div>
    </div>
  );
}
