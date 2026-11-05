import { requireAdminPageSession } from "@/modules/auth";
import { createConfiguredEmailCenter } from "@/modules/email";
import { CampaignComposer } from "./campaign-composer";
export default async function NewCampaignPage() {
  const options = await createConfiguredEmailCenter().campaignComposerOptions(
    await requireAdminPageSession(),
  );
  return (
    <div className="admin-page admin-page--wide">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Email center / Campaigns</p>
          <h1>Create campaign</h1>
          <p>
            Save an email draft with featured listings and your selected
            audience.
          </p>
        </div>
      </header>
      <CampaignComposer
        options={{
          templates: options.templates,
          contactAudiences: options.contactAudiences,
          users: options.users,
          listings: options.listings.map((listing) => ({
            id: listing.id,
            title: listing.title,
            eventType: listing.eventType,
            startsAt: listing.startsAt?.toISOString() ?? "",
            location: listing.location,
          })),
        }}
      />
    </div>
  );
}
