import { z } from "zod";
import { createConfiguredEmailCenter } from "@/modules/email";
import { adminEmailMutation } from "../../../_route";
const schema = z.object({ revisionId: z.uuid() }).strict();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  return adminEmailMutation(
    request,
    "admin.email.templates.rollback",
    "EMAIL_TEMPLATE",
    async ({ session, body, requestId }) => {
      await createConfiguredEmailCenter().rollback(
        session,
        templateId,
        schema.parse(body).revisionId,
        requestId,
      );
      return { ok: true };
    },
  );
}
