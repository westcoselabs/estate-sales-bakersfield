import { z } from "zod";
import { after } from "next/server";
import {
  createConfiguredEmailCenter,
  runConfiguredEmailJobBatch,
} from "@/modules/email";
import { adminEmailMutation } from "../../../_route";
export const maxDuration = 60;
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
    async ({ session, body, requestId }) => {
      const result = await createConfiguredEmailCenter().sendCampaign(
        session,
        campaignId,
        schema.parse(body),
        requestId,
      );
      after(async () => {
        await runConfiguredEmailJobBatch(10);
      });
      return result;
    },
  );
}
