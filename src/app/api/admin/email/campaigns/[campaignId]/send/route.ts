import { z } from "zod";
import { createConfiguredEmailCenter } from "@/modules/email";
import { adminEmailMutation } from "../../../_route";
const schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    confirmation: z.literal("SEND"),
  })
  .strict();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;
  return adminEmailMutation(
    request,
    "admin.email.campaigns.send",
    "EMAIL_CAMPAIGN",
    async ({ session, body, requestId }) =>
      createConfiguredEmailCenter().sendCampaign(
        session,
        campaignId,
        schema.parse(body),
        requestId,
      ),
  );
}
