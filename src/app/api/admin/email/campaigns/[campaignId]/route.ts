import { z } from "zod";

import { createConfiguredEmailCenter } from "@/modules/email";

import { adminEmailMutation } from "../../_route";

const schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(100),
    subject: z.string().trim().min(1).max(200),
    previewText: z.string().trim().max(200).optional(),
  })
  .strict();

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
      const { previewText, ...input } = schema.parse(body);
      await createConfiguredEmailCenter().updateCampaign(
        session,
        campaignId,
        { ...input, ...(previewText ? { previewText } : {}) },
        requestId,
      );
      return { ok: true };
    },
  );
}
