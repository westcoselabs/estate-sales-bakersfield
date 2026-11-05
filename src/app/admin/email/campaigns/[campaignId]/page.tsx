import { notFound } from "next/navigation";
import { requireAdminPageSession } from "@/modules/auth";
import {
  createConfiguredEmailCenter,
  isDraftOnlyCampaign,
} from "@/modules/email";
import { parseCampaignListingSnapshot } from "@/modules/email";
import { CampaignActions } from "./campaign-actions";
import { CampaignPreview } from "../campaign-preview";
const audienceCategoryLabel = (category: string) =>
  category === "ATTENDEE" ? "Estate Sale Attendees" : "Business Owners";
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const session = await requireAdminPageSession();
  const center = createConfiguredEmailCenter();
  const campaign = await center.getCampaign(session, campaignId);
  if (!campaign) notFound();
  const listings = parseCampaignListingSnapshot(campaign.listingSnapshot);
  const contactAudiences =
    campaign.selectionMode === "CONTACT_SEGMENT"
      ? (await center.campaignComposerOptions(session)).contactAudiences
      : [];
  const draftOnly = isDraftOnlyCampaign(campaign);
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
          <h2>
            {campaign.templateRevision?.template.name ??
              "Branded HTML email draft"}
          </h2>
          <dl>
            <div>
              <dt>Content</dt>
              <dd>
                {campaign.templateRevision
                  ? `Template revision ${campaign.templateRevision.revisionNumber}`
                  : "Saved email HTML"}
              </dd>
            </div>
            <div>
              <dt>Audience</dt>
              <dd>
                {campaign.contactAudience
                  ? `${campaign.contactAudience.sourceTag} · ${audienceCategoryLabel(campaign.contactAudience.category)}`
                  : campaign.selectionMode.replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt>Recipients</dt>
              <dd>
                {campaign.contactAudience
                  ? `${campaign.contactAudience.eligible} eligible · ${campaign.contactAudience.suppressed} suppressed or ineligible · ${campaign.contactAudience.total} total`
                  : campaign.recipientCount || "Revalidated at send"}
              </dd>
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
        key={`${campaign.id}:${campaign.version}`}
        contactAudiences={contactAudiences}
        draftOnly={draftOnly}
        campaign={{
          id: campaign.id,
          name: campaign.name,
          subject: campaign.subject,
          previewText: campaign.previewText,
          status: campaign.status,
          version: campaign.version,
          testedAt: campaign.testedAt?.toISOString() ?? null,
          draftHtml: campaign.draftHtml,
          contactCategory: campaign.contactCategory,
          contactSourceTag: campaign.contactSourceTag,
        }}
      />
      {campaign.draftHtml && <CampaignPreview html={campaign.draftHtml} />}
    </div>
  );
}
