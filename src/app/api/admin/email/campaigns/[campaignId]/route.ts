import {
  createConfiguredEmailCenter,
  updateCampaignSchema,
  type UpdateCampaignInput,
} from "@/modules/email";

import { adminEmailMutation } from "../../_route";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  return adminEmailMutation(
    request,
    "admin.email.campaigns.update",
    "EMAIL_CAMPAIGN",
    async ({ session, body, requestId }) => {
      const input = updateCampaignSchema.parse(body) as UpdateCampaignInput;
      await createConfiguredEmailCenter().updateCampaign(
        session,
        campaignId,
        input,
        requestId,
      );
      return { ok: true };
    },
  );
}
