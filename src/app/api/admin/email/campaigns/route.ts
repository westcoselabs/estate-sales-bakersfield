import { z } from "zod";
import { createConfiguredEmailCenter } from "@/modules/email";
import { adminEmailMutation } from "../_route";
const schema = z
  .object({
    name: z.string().trim().min(1).max(100),
    subject: z.string().trim().min(1).max(200),
    previewText: z.string().trim().max(200).optional(),
    templateRevisionId: z.uuid(),
    listingIds: z.array(z.uuid()).min(1).max(6),
    selectionMode: z.enum(["ALL_ELIGIBLE", "SELECTED_USERS"]),
    selectedUserIds: z.array(z.uuid()).max(10_000),
  })
  .strict();
export async function POST(request: Request) {
  return adminEmailMutation(
    request,
    "admin.email.campaigns.create",
    "EMAIL_CAMPAIGN",
    async ({ session, body, requestId }) => {
      const { previewText, ...input } = schema.parse(body);
      return createConfiguredEmailCenter().createCampaign(
        session,
        { ...input, ...(previewText ? { previewText } : {}) },
        requestId,
      );
    },
  );
}
