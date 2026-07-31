import { z } from "zod";
import { createConfiguredEmailCenter } from "@/modules/email";
import { adminEmailMutation } from "../../../_route";
const schema = z
  .object({
    subject: z.string().trim().min(1).max(200),
    html: z.string().min(1).max(256_000),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  return adminEmailMutation(
    request,
    "admin.email.templates.draft",
    "EMAIL_TEMPLATE",
    async ({ session, body }) =>
      createConfiguredEmailCenter().saveDraft(
        session,
        templateId,
        schema.parse(body),
      ),
  );
}
