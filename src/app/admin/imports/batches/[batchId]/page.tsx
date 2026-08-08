import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { getCurrentUser, requireSuperAdminPrincipal } from "@/modules/auth";
import { createConfiguredListingImportAdminQueryService } from "@/modules/listing-imports";

import { CopyId } from "../../../_components/copy-id";
import { ImportStatus, importLabel } from "../../_components/import-status";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(value);
}

export default async function ListingImportBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const principal = requireSuperAdminPrincipal(await getCurrentUser());
  const parsedId = z
    .string()
    .uuid()
    .safeParse((await params).batchId);
  if (!parsedId.success) notFound();
  const batch =
    await createConfiguredListingImportAdminQueryService().batchDetail(
      principal,
      parsedId.data,
    );
  if (!batch) notFound();

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">{batch.source.name} import</p>
          <h1>Batch {batch.id.slice(0, 8)}</h1>
          <p>
            {importLabel(batch.transport)} · {batch.counts.total} retained row
            {batch.counts.total === 1 ? "" : "s"}
          </p>
        </div>
        <ImportStatus value={batch.status} />
      </header>

      <div className="admin-actions">
        <Link
          className="ui-button ui-button--secondary"
          href="/admin/imports?view=batches"
        >
          Back to batches
        </Link>
      </div>

      <section className="admin-panel" aria-labelledby="batch-metadata-title">
        <header>
          <h2 id="batch-metadata-title">Batch metadata</h2>
        </header>
        <dl className="admin-detail-list">
          <div>
            <dt>Batch ID</dt>
            <dd>
              <CopyId label="batch ID" value={batch.id} />
            </dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              {batch.source.name} ({batch.source.key})
            </dd>
          </div>
          <div>
            <dt>Contract</dt>
            <dd>{batch.contractVersion}</dd>
          </div>
          <div>
            <dt>Parser</dt>
            <dd>{batch.parserVersion}</dd>
          </div>
          <div>
            <dt>Run ID</dt>
            <dd>{batch.ingestorRunId}</dd>
          </div>
          <div>
            <dt>Instance</dt>
            <dd>{batch.ingestorInstanceId}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDate(batch.createdAt)}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{formatDate(batch.completedAt)}</dd>
          </div>
          <div>
            <dt>Sealed</dt>
            <dd>{batch.sealedAt ? formatDate(batch.sealedAt) : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="admin-panel" aria-labelledby="batch-counts-title">
        <header>
          <h2 id="batch-counts-title">Retained outcomes</h2>
        </header>
        <dl className="admin-detail-list admin-import-counts">
          <div>
            <dt>Total</dt>
            <dd>{batch.counts.total}</dd>
          </div>
          <div>
            <dt>Candidates</dt>
            <dd>{batch.counts.candidate}</dd>
          </div>
          <div>
            <dt>Invalid</dt>
            <dd>{batch.counts.invalid}</dd>
          </div>
          <div>
            <dt>Exact duplicates</dt>
            <dd>{batch.counts.exactDuplicate}</dd>
          </div>
          <div>
            <dt>Source changed</dt>
            <dd>{batch.counts.sourceChanged}</dd>
          </div>
          <div>
            <dt>Identity conflicts</dt>
            <dd>{batch.counts.identityConflict}</dd>
          </div>
        </dl>
      </section>

      <section
        className="admin-panel admin-panel--table"
        aria-labelledby="batch-rows-title"
      >
        <div className="admin-table-toolbar">
          <div>
            <strong id="batch-rows-title">Row observations</strong>
            <span>
              Input payloads and private addresses are not exposed here
            </span>
          </div>
          <span className="admin-section-count">{batch.rows.length}</span>
        </div>
        {batch.rows.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>Bounded import row results</caption>
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Status</th>
                  <th scope="col">Validation</th>
                  <th scope="col">Candidate</th>
                  <th scope="col">Observed</th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td data-label="Row">{row.rowNumber}</td>
                    <td data-label="Status">
                      <ImportStatus value={row.status} />
                    </td>
                    <td data-label="Validation">
                      {row.validationCodes.length
                        ? row.validationCodes.map(importLabel).join(", ")
                        : "—"}
                    </td>
                    <td data-label="Candidate">
                      {row.candidateId ? (
                        <Link
                          href={`/admin/imports/candidates/${row.candidateId}`}
                        >
                          Review candidate
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-label="Observed">{formatDate(row.observedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No row observations were retained.</p>
        )}
      </section>
    </div>
  );
}
