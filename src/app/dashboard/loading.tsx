import { DashboardShell } from "@/components/shells/shells";
import { Skeleton } from "@/components/ui/primitives";

export default function DashboardLoading() {
  return (
    <DashboardShell>
      <div className="dashboard-content" role="status" aria-live="polite">
        <span className="sr-only">Loading dashboard</span>
        <header className="dashboard-page-header">
          <div>
            <Skeleton className="skeleton-eyebrow" decorative />
            <Skeleton className="skeleton-title" decorative />
            <Skeleton className="skeleton-copy" decorative />
          </div>
        </header>
        <div className="dashboard-listing-grid">
          <Skeleton className="skeleton-card" decorative />
          <Skeleton className="skeleton-card" decorative />
        </div>
      </div>
    </DashboardShell>
  );
}
