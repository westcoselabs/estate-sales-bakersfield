import { z } from "zod";
import { createConfiguredEmailCenter } from "@/modules/email";
import { adminEmailMutation } from "../../../_route";
const schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    confirmation: z.literal("PUBLISH"),
  })
  .strict();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  return adminEmailMutation(
    request,
    "admin.email.templates.publish",
    "EMAIL_TEMPLATE",
    async ({ session, body, requestId }) =>
      createConfiguredEmailCenter().publish(
        session,
        templateId,
        schema.parse(body),
        requestId,
      ),
  );
}
