import Link from "next/link";

export type ImportAdminView =
  "candidates" | "batches" | "listings" | "credentials";

const views: readonly {
  readonly key: ImportAdminView;
  readonly label: string;
}[] = [
  { key: "candidates", label: "Pending candidates" },
  { key: "batches", label: "Batch history" },
  { key: "listings", label: "Published listings" },
  { key: "credentials", label: "Credentials" },
];

export function ImportNavigation({
  active,
  counts,
}: {
  readonly active: ImportAdminView;
  readonly counts: Readonly<Record<ImportAdminView, number>>;
}) {
  return (
    <nav className="admin-import-tabs" aria-label="Listing import views">
      {views.map((view) => (
        <Link
          aria-current={active === view.key ? "page" : undefined}
          href={`/admin/imports?view=${view.key}`}
          key={view.key}
        >
          <span>{view.label}</span>
          <strong>{counts[view.key]}</strong>
        </Link>
      ))}
    </nav>
  );
}
