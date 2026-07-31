import { z } from "zod";
import { createConfiguredEmailCenter } from "@/modules/email";
import { adminEmailMutation } from "../../../_route";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  return adminEmailMutation(
    request,
    "admin.email.campaigns.test",
    "EMAIL_CAMPAIGN",
    async ({ session, body, requestId }) => {
      z.object({}).strict().parse(body);
      await createConfiguredEmailCenter().testCampaign(
        session,
        campaignId,
        requestId,
      );
      return { ok: true };
    },
  );
}
