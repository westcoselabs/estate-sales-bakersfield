import { notFound } from "next/navigation";
import { getCurrentSession } from "@/modules/auth";
import { createConfiguredEmailCenter } from "@/modules/email";
import { parseCampaignListingSnapshot } from "@/modules/email";
import { CampaignActions } from "./campaign-actions";
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const campaign = await createConfiguredEmailCenter().getCampaign(
    await getCurrentSession(),
    campaignId,
  );
  if (!campaign) notFound();
  const listings = parseCampaignListingSnapshot(campaign.listingSnapshot);
  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Email center / Campaign</p>
          <h1>{campaign.name}</h1>
          <p>{campaign.subject}</p>
        </div>
        <span
          className={`admin-status ${campaign.status === "SENT" ? "admin-status--success" : "admin-status--warning"}`}
        >
          {campaign.status.replaceAll("_", " ")}
        </span>
      </header>
      <div className="campaign-detail-grid">
        <section className="admin-panel campaign-summary">
          <p className="eyebrow">Message</p>
          <h2>{campaign.templateRevision.template.name}</h2>
          <dl>
            <div>
              <dt>Template revision</dt>
              <dd>{campaign.templateRevision.revisionNumber}</dd>
            </div>
            <div>
              <dt>Audience</dt>
              <dd>{campaign.selectionMode.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Recipients</dt>
              <dd>{campaign.recipientCount || "Revalidated at send"}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>{campaign.version}</dd>
            </div>
          </dl>
        </section>
        <section className="admin-panel campaign-summary">
          <p className="eyebrow">Featured sales</p>
          <h2>{listings.length} listings</h2>
          <ul>
            {listings.map((l) => (
              <li key={l.eventId}>
                <strong>{l.title}</strong>
                <span>
                  {l.city} · {new Date(l.startsAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <CampaignActions
        campaign={{
          id: campaign.id,
          name: campaign.name,
          subject: campaign.subject,
          previewText: campaign.previewText,
          status: campaign.status,
          version: campaign.version,
          testedAt: campaign.testedAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
