import Link from "next/link";

import { getCurrentUser, requireSuperAdminPrincipal } from "@/modules/auth";
import {
  createConfiguredListingImportAdminQueryService,
  listingImportAdminLandingCriteria,
  type ListingImportAdminLandingResult,
} from "@/modules/listing-imports";
import { getServerEnvironment } from "@/platform/config/env";

import { CredentialManager } from "./_components/credential-manager";
import { ImportNavigation } from "./_components/import-navigation";
import { ImportPagination } from "./_components/import-pagination";
import { ImportStatus, importLabel } from "./_components/import-status";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(value);
}

function Schedule({ startsAt, endsAt }: { startsAt: Date; endsAt: Date }) {
  return (
    <>
      <time dateTime={startsAt.toISOString()}>{formatDate(startsAt)}</time>
      <br />
      <small>through {formatDate(endsAt)}</small>
    </>
  );
}

function ActiveTable({
  active,
}: {
  active: ListingImportAdminLandingResult["active"];
}) {
  switch (active.view) {
    case "candidates":
      return active.page.rows.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption>Pending imported listing candidates</caption>
            <thead>
              <tr>
                <th scope="col">Candidate</th>
                <th scope="col">Source</th>
                <th scope="col">Schedule</th>
                <th scope="col">Location</th>
                <th scope="col">Duplicates</th>
                <th scope="col">Imported</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {active.page.rows.map((candidate) => (
                <tr key={candidate.id}>
                  <td data-label="Candidate">
                    <Link
                      className="admin-table__primary"
                      href={`/admin/imports/candidates/${candidate.id}`}
                    >
                      {candidate.title}
                    </Link>
                    <br />
                    <small>Version {candidate.version}</small>
                  </td>
                  <td data-label="Source">
                    {candidate.source.name}
                    <br />
                    <small>{candidate.source.key}</small>
                  </td>
                  <td data-label="Schedule">
                    <Schedule
                      startsAt={candidate.startsAt}
                      endsAt={candidate.endsAt}
                    />
                  </td>
                  <td data-label="Location">
                    {candidate.locationSummary ?? candidate.city}
                  </td>
                  <td data-label="Duplicates">
                    {candidate.unresolvedDuplicateCount ? (
                      <span className="admin-status admin-status--warning">
                        {candidate.unresolvedDuplicateCount} unresolved
                      </span>
                    ) : (
                      "None unresolved"
                    )}
                  </td>
                  <td data-label="Imported">
                    {formatDate(candidate.importedAt)}
                  </td>
                  <td data-label="Status">
                    <ImportStatus value={candidate.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin-empty-state">
          <h2>No pending candidates</h2>
          <p>New valid imports will appear here for review.</p>
        </div>
      );
    case "batches":
      return active.page.rows.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption>Listing import batch history</caption>
            <thead>
              <tr>
                <th scope="col">Batch</th>
                <th scope="col">Source</th>
                <th scope="col">Transport</th>
                <th scope="col">Run / parser</th>
                <th scope="col">Rows</th>
                <th scope="col">Received</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {active.page.rows.map((batch) => (
                <tr key={batch.id}>
                  <td data-label="Batch">
                    <Link
                      className="admin-table__primary"
                      href={`/admin/imports/batches/${batch.id}`}
                    >
                      {batch.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td data-label="Source">{batch.source.name}</td>
                  <td data-label="Transport">{importLabel(batch.transport)}</td>
                  <td data-label="Run / parser">
                    {batch.ingestorRunId}
                    <br />
                    <small>{batch.parserVersion}</small>
                  </td>
                  <td data-label="Rows">
                    {batch.counts.candidate} candidates / {batch.counts.total}{" "}
                    total
                  </td>
                  <td data-label="Received">{formatDate(batch.createdAt)}</td>
                  <td data-label="Status">
                    <ImportStatus value={batch.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin-empty-state">
          <h2>No import batches</h2>
          <p>
            Submit a manual import or push a batch through the ingestion API.
          </p>
        </div>
      );
    case "listings":
      return active.page.rows.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption>Published external listings</caption>
            <thead>
              <tr>
                <th scope="col">Listing</th>
                <th scope="col">Source</th>
                <th scope="col">Schedule</th>
                <th scope="col">Published</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {active.page.rows.map((listing) => (
                <tr key={listing.id}>
                  <td data-label="Listing">
                    <Link
                      className="admin-table__primary"
                      href={`/admin/imports/listings/${listing.id}`}
                    >
                      {listing.title}
                    </Link>
                    <br />
                    <small>Version {listing.version}</small>
                  </td>
                  <td data-label="Source">{listing.source.name}</td>
                  <td data-label="Schedule">
                    <Schedule
                      startsAt={listing.startsAt}
                      endsAt={listing.endsAt}
                    />
                  </td>
                  <td data-label="Published">
                    {formatDate(listing.publishedAt)}
                  </td>
                  <td data-label="Status">
                    <ImportStatus value={listing.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin-empty-state">
          <h2>No external listings</h2>
          <p>
            Approved candidates will appear here without creating organizer
            events.
          </p>
        </div>
      );
    case "credentials":
      return null;
  }
}

export default async function ListingImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; cursor?: string; limit?: string }>;
}) {
  const principal = requireSuperAdminPrincipal(await getCurrentUser());
  const criteria = listingImportAdminLandingCriteria(await searchParams);
  const result = await createConfiguredListingImportAdminQueryService().landing(
    principal,
    criteria,
  );
  const production = getServerEnvironment().APP_ENV === "production";
  const credentialSources = production
    ? result.sources.filter((source) => source.productionAllowed)
    : result.sources;
  const counts = {
    candidates: result.summary.pendingCandidates,
    batches: result.summary.batches,
    listings: result.summary.publishedListings,
    credentials: result.summary.activeCredentials,
  } as const;

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Review before publication</p>
          <h1>Listing Imports</h1>
          <p>
            Inspect source observations, resolve possible duplicates, and
            publish external listings without creating organizer or payment
            records.
          </p>
        </div>
        <Link
          className="ui-button ui-button--primary"
          href="/admin/imports/new"
        >
          New manual import
        </Link>
      </header>

      <ImportNavigation active={criteria.view} counts={counts} />

      {result.active.view === "credentials" ? (
        <CredentialManager
          production={production}
          credentials={result.active.page.rows.map((credential) => ({
            id: credential.id,
            name: credential.name,
            sourceKey: credential.source.key,
            sourceName: credential.source.name,
            displayPrefix: credential.displayPrefix,
            createdAt: credential.createdAt.toISOString(),
            lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
            revokedAt: credential.revokedAt?.toISOString() ?? null,
          }))}
          sources={credentialSources.map((source) => ({
            id: source.id,
            key: source.key,
            name: source.name,
            productionAllowed: source.productionAllowed,
          }))}
        />
      ) : (
        <section className="admin-panel admin-panel--table">
          <div className="admin-table-toolbar">
            <div>
              <strong>
                {criteria.view === "candidates"
                  ? "Pending candidates"
                  : criteria.view === "batches"
                    ? "Batch history"
                    : "Published external listings"}
              </strong>
              <span>Newest records first</span>
            </div>
            <span className="admin-section-count">
              {result.active.page.rows.length} on this page
            </span>
          </div>
          <ActiveTable active={result.active} />
        </section>
      )}

      <ImportPagination
        nextCursor={result.active.page.nextCursor}
        shown={result.active.page.rows.length}
        view={result.active.view}
      />
    </div>
  );
}
