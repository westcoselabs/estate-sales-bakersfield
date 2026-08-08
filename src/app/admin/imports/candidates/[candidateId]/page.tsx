import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { getCurrentUser, requireSuperAdminPrincipal } from "@/modules/auth";
import { createConfiguredListingImportAdminQueryService } from "@/modules/listing-imports";

import { CopyId } from "../../../_components/copy-id";
import { CandidateActions } from "../../_components/candidate-actions";
import { CandidateEditor } from "../../_components/candidate-editor";
import { CandidateReviewStateProvider } from "../../_components/candidate-review-state";
import {
  DuplicateReview,
  type CandidateDuplicateView,
} from "../../_components/duplicate-review";
import { ImportStatus, importLabel } from "../../_components/import-status";

function formatDate(value: Date | null): string {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Los_Angeles",
      }).format(value)
    : "—";
}

function sourceHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "Original source";
  }
}

export default async function ListingImportCandidatePage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const principal = requireSuperAdminPrincipal(await getCurrentUser());
  const parsedId = z
    .string()
    .uuid()
    .safeParse((await params).candidateId);
  if (!parsedId.success) notFound();
  const candidate =
    await createConfiguredListingImportAdminQueryService().candidateDetail(
      principal,
      parsedId.data,
    );
  if (!candidate) notFound();

  const duplicates: CandidateDuplicateView[] = candidate.duplicates.map(
    (match) => {
      const target = match.target;
      return {
        id: match.id,
        resolution: match.resolution,
        recheckOnly: match.recheckOnly,
        reasons: match.reasons,
        targetKind: target.kind,
        targetId: target.id,
        targetTitle: target.title,
        targetHref:
          target.kind === "EVENT"
            ? `/admin/listings/${target.id}`
            : `/admin/imports/listings/${target.id}`,
        linkAvailable: target.linkAvailable,
      };
    },
  );
  const pending = candidate.status === "PENDING_REVIEW";
  const locationConfirmed =
    candidate.location.confirmationStatus === "CONFIRMED";
  const approvalBlockedReason = !locationConfirmed
    ? "Confirm the saved location before approval."
    : candidate.unresolvedDuplicateCount > 0
      ? "Resolve every current duplicate warning before approval."
      : null;

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">
            {candidate.provenance.source.name} candidate
          </p>
          <h1>{candidate.payload?.title ?? "Invalid candidate payload"}</h1>
          <p>
            Imported {formatDate(candidate.provenance.importedAt)} · version{" "}
            {candidate.version}
          </p>
        </div>
        <ImportStatus value={candidate.status} />
      </header>

      <div className="admin-actions">
        <Link
          className="ui-button ui-button--secondary"
          href="/admin/imports?view=candidates"
        >
          Back to candidates
        </Link>
        {candidate.externalListingId ? (
          <Link
            className="ui-button ui-button--primary"
            href={`/admin/imports/listings/${candidate.externalListingId}`}
          >
            Open external listing
          </Link>
        ) : null}
      </div>

      <CandidateReviewStateProvider
        key={`${candidate.id}:${candidate.version}`}
      >
        {!candidate.payloadValid || !candidate.payload ? (
          <section className="admin-panel">
            <h2>Candidate payload needs investigation</h2>
            <p className="ui-alert ui-alert--error">
              The retained payload no longer satisfies the audited review
              contract. Approval is unavailable.
            </p>
          </section>
        ) : pending ? (
          <CandidateEditor
            candidateId={candidate.id}
            content={candidate.payload}
            locationConfirmed={locationConfirmed}
            version={candidate.version}
          />
        ) : (
          <section className="admin-panel">
            <h2>Review completed</h2>
            <p>
              This candidate is terminal in version 1. Import observations and
              provenance remain retained.
            </p>
            {candidate.reviewReason ? (
              <p>
                <strong>Reason:</strong> {candidate.reviewReason}
              </p>
            ) : null}
          </section>
        )}

        <section
          className="admin-panel"
          aria-labelledby="candidate-provenance-title"
        >
          <header>
            <h2 id="candidate-provenance-title">Provenance and location</h2>
          </header>
          <dl className="admin-detail-list">
            <div>
              <dt>Candidate ID</dt>
              <dd>
                <CopyId label="candidate ID" value={candidate.id} />
              </dd>
            </div>
            <div>
              <dt>Source listing ID</dt>
              <dd>{candidate.provenance.sourceListingId}</dd>
            </div>
            <div>
              <dt>Original source</dt>
              <dd>
                <a
                  href={candidate.provenance.canonicalSourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {sourceHost(candidate.provenance.canonicalSourceUrl)}
                </a>
              </dd>
            </div>
            <div>
              <dt>First / last seen</dt>
              <dd>
                {formatDate(candidate.provenance.firstSeenAt)} /{" "}
                {formatDate(candidate.provenance.lastSeenAt)}
              </dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>
                <ImportStatus value={candidate.location.confirmationStatus} />
              </dd>
            </div>
            <div>
              <dt>Resolution source</dt>
              <dd>{importLabel(candidate.location.resolutionSource)}</dd>
            </div>
            <div>
              <dt>Confirmed</dt>
              <dd>{formatDate(candidate.location.confirmedAt)}</dd>
            </div>
            <div>
              <dt>Reviewed</dt>
              <dd>{formatDate(candidate.reviewedAt)}</dd>
            </div>
          </dl>
        </section>

        <DuplicateReview
          candidateId={candidate.id}
          duplicates={duplicates}
          duplicatesTruncated={candidate.duplicatesTruncated}
          editable={pending && candidate.payloadValid}
          unresolvedDuplicateCount={candidate.unresolvedDuplicateCount}
          version={candidate.version}
        />

        {pending && candidate.payloadValid && candidate.payload ? (
          <section
            className="admin-panel"
            aria-labelledby="candidate-actions-title"
          >
            <header>
              <h2 id="candidate-actions-title">Review decision</h2>
            </header>
            <p>
              Approval revalidates the candidate, confirmed location, and
              duplicate state before creating a separate external listing.
            </p>
            <CandidateActions
              {...(approvalBlockedReason ? { approvalBlockedReason } : {})}
              candidateId={candidate.id}
              title={candidate.payload.title}
              version={candidate.version}
            />
          </section>
        ) : null}
      </CandidateReviewStateProvider>

      <section className="admin-panel" aria-labelledby="candidate-audit-title">
        <header>
          <h2 id="candidate-audit-title">Audit timeline</h2>
        </header>
        {candidate.audit.length ? (
          <ol className="admin-activity-list">
            {candidate.audit.map((entry) => (
              <li key={entry.id}>
                <span>
                  <strong>{importLabel(entry.action)}</strong>
                  <time dateTime={entry.occurredAt.toISOString()}>
                    {formatDate(entry.occurredAt)}
                  </time>
                  {entry.requestId ? (
                    <CopyId label="request ID" value={entry.requestId} />
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p>No allowlisted review audit entries.</p>
        )}
        {candidate.auditTruncated ? (
          <p>
            <small>Only the newest audit entries are shown.</small>
          </p>
        ) : null}
      </section>
    </div>
  );
}
