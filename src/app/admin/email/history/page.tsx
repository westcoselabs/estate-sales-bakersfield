import { getCurrentSession } from "@/modules/auth";
import { createConfiguredEmailCenter } from "@/modules/email";

export default async function EmailHistoryPage() {
  const rows = await createConfiguredEmailCenter().listDeliveryHistory(
    await getCurrentSession(),
  );
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Email center / History</p>
          <h1>Delivery history</h1>
          <p>
            The latest transactional deliveries, with sanitized status and
            revision references.
          </p>
        </div>
      </header>
      <section className="admin-panel admin-panel--table">
        <div className="admin-table-toolbar">
          <div>
            <strong>Transactional email</strong>
            <span>Newest delivery first</span>
          </div>
          <span className="admin-section-count">{rows.length} records</span>
        </div>
        {rows.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <caption>Recent email deliveries</caption>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Kind</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Recipient">
                      <strong>{row.user.displayName}</strong>
                      <br />
                      <small>{row.user.email}</small>
                    </td>
                    <td data-label="Kind">{row.kind.replaceAll("_", " ")}</td>
                    <td data-label="Template">
                      {row.templateRevision
                        ? `${row.templateRevision.template.name} · r${row.templateRevision.revisionNumber}`
                        : "Compiled fallback"}
                    </td>
                    <td data-label="Status">
                      <span
                        className={`admin-status ${["SENT", "DELIVERED"].includes(row.status) ? "admin-status--success" : "admin-status--warning"}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td data-label="Created">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td data-label="Attempts">{row.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state">
            <h2>No deliveries recorded</h2>
            <p>
              New verification, reset, and receipt messages will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
