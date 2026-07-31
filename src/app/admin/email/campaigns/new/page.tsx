import { getCurrentSession } from "@/modules/auth";
import { createConfiguredEmailCenter } from "@/modules/email";
import { CampaignComposer } from "./campaign-composer";
export default async function NewCampaignPage() {
  const options = await createConfiguredEmailCenter().campaignComposerOptions(
    await getCurrentSession(),
  );
  return (
    <div className="admin-page admin-page--wide">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">Email center / Campaigns</p>
          <h1>Create campaign</h1>
          <p>
            Pair a published template with active listings and a verified
            audience.
          </p>
        </div>
      </header>
      <CampaignComposer
        options={{
          templates: options.templates,
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
