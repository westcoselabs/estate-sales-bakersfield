import Link from "next/link";
import { getCurrentSession } from "@/modules/auth";
import { createConfiguredEmailCenter } from "@/modules/email";
export default async function CampaignsPage() {
  const campaigns = await createConfiguredEmailCenter().listCampaigns(
    await getCurrentSession(),
  );
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Email center / Campaigns</p>
          <h1>Campaigns</h1>
          <p>
            Immediate, reviewed sends featuring currently active public
            listings.
          </p>
        </div>
        <Link
          className="ui-button ui-button--primary"
          href="/admin/email/campaigns/new"
        >
          Create campaign
        </Link>
      </header>
      <section className="admin-panel admin-panel--table">
        <div className="admin-table-toolbar">
          <div>
            <strong>Campaign history</strong>
            <span>Newest campaigns first</span>
          </div>
          <span className="admin-section-count">
            {campaigns.length} campaigns
          </span>
        </div>
        {campaigns.length ? (
          <div className="email-template-list">
            {campaigns.map((c) => (
              <Link
                className="email-template-row"
                href={`/admin/email/campaigns/${c.id}`}
                key={c.id}
              >
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {c.subject} · {new Date(c.createdAt).toLocaleDateString()}
                  </small>
                </span>
                <span
                  className={`admin-status ${c.status === "SENT" ? "admin-status--success" : "admin-status--warning"}`}
                >
                  {c.status.replaceAll("_", " ")}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="admin-empty-state">
            <h2>No campaigns yet</h2>
            <p>Create a focused update from one to six recent listings.</p>
          </div>
        )}
      </section>
    </div>
  );
}
