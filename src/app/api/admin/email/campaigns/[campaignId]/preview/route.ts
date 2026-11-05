import {
  campaignPreviewSchema,
  createConfiguredEmailCenter,
} from "@/modules/email";
import { adminEmailMutation } from "../../../_route";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  return adminEmailMutation(
    request,
    "admin.email.campaigns.preview",
    "EMAIL_CAMPAIGN",
    async ({ session, body }) => {
      return createConfiguredEmailCenter().previewCampaignDraft(
        session,
        campaignId,
        campaignPreviewSchema.parse(body),
      );
    },
  );
}
