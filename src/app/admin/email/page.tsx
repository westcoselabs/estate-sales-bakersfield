import Link from "next/link";

import { getCurrentSession } from "@/modules/auth";
import { createConfiguredEmailCenter } from "@/modules/email";

export default async function AdminEmailPage() {
  const session = await getCurrentSession();
  const center = createConfiguredEmailCenter();
  const [templates, campaigns] = await Promise.all([
    center.listTemplates(session),
    center.listCampaigns(session),
  ]);
  return (
    <div className="admin-page email-center-page">
      <header className="admin-page-header email-hero">
        <div>
          <p className="eyebrow">Customer communications</p>
          <h1>Email center</h1>
          <p>
            Shape every customer email and send timely sale updates from one
            controlled workspace.
          </p>
        </div>
        <Link
          className="ui-button ui-button--primary"
          href="/admin/email/campaigns/new"
        >
          Create campaign
        </Link>
      </header>
      <div className="email-overview-grid">
        <section className="admin-panel email-overview-card">
          <span className="email-overview-card__icon">01</span>
          <p className="eyebrow">Template library</p>
          <h2>
            {templates.filter((template) => !template.archivedAt).length} active
            templates
          </h2>
          <p>
            Verification, password recovery, receipts, and branded marketing
            layouts.
          </p>
          <Link href="/admin/email/templates">Manage templates →</Link>
        </section>
        <section className="admin-panel email-overview-card email-overview-card--gold">
          <span className="email-overview-card__icon">02</span>
          <p className="eyebrow">Campaign studio</p>
          <h2>{campaigns.length} campaigns</h2>
          <p>
            Select current listings, review the audience, test, and send through
            Resend.
          </p>
          <Link href="/admin/email/campaigns">View campaigns →</Link>
        </section>
        <section className="admin-panel email-overview-card">
          <span className="email-overview-card__icon">03</span>
          <p className="eyebrow">Delivery history</p>
          <h2>Operational record</h2>
          <p>
            Review transactional delivery and campaign outcomes without exposing
            provider payloads.
          </p>
          <Link href="/admin/email/history">Open history →</Link>
        </section>
      </div>
      <section className="admin-panel email-section">
        <div className="admin-table-toolbar">
          <div>
            <strong>Recently updated templates</strong>
            <span>Published content remains immutable</span>
          </div>
          <Link href="/admin/email/templates/new">New marketing template</Link>
        </div>
        <div className="email-template-list">
          {templates.slice(0, 6).map((template) => (
            <Link
              className="email-template-row"
              href={`/admin/email/templates/${template.id}`}
              key={template.id}
            >
              <span>
                <strong>{template.name}</strong>
                <small>
                  {template.category.toLowerCase()} · draft v
                  {template.draftVersion}
                </small>
              </span>
              <span
                className={`admin-status ${template.activeRevision ? "admin-status--success" : "admin-status--warning"}`}
              >
                {template.activeRevision
                  ? `Published r${template.activeRevision.revisionNumber}`
                  : "Draft only"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
