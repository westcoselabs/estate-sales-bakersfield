import Link from "next/link";
import { getCurrentSession } from "@/modules/auth";
import { createConfiguredEmailCenter } from "@/modules/email";

export default async function EmailTemplatesPage() {
  const templates = await createConfiguredEmailCenter().listTemplates(
    await getCurrentSession(),
  );
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Email center / Templates</p>
          <h1>Template library</h1>
          <p>
            Edit application email HTML with safe previews and immutable
            published revisions.
          </p>
        </div>
        <Link
          className="ui-button ui-button--primary"
          href="/admin/email/templates/new"
        >
          New template
        </Link>
      </header>
      <section className="admin-panel admin-panel--table">
        <div className="admin-table-toolbar">
          <div>
            <strong>All templates</strong>
            <span>System templates are protected</span>
          </div>
          <span className="admin-section-count">
            {templates.length} templates
          </span>
        </div>
        <div className="email-template-list">
          {templates.map((template) => (
            <Link
              className="email-template-row"
              href={`/admin/email/templates/${template.id}`}
              key={template.id}
            >
              <span>
                <strong>{template.name}</strong>
                <small>
                  {template.key ? "System" : "Custom marketing"} ·{" "}
                  {template.draftSubject}
                </small>
              </span>
              <span>
                <span
                  className={`admin-status ${template.archivedAt ? "admin-status--warning" : "admin-status--success"}`}
                >
                  {template.archivedAt
                    ? "Archived"
                    : template.activeRevision
                      ? `Revision ${template.activeRevision.revisionNumber}`
                      : "Draft"}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
