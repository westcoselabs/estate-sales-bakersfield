import { z } from "zod";
import { createConfiguredEmailCenter } from "@/modules/email";
import { adminEmailMutation } from "../../../_route";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await params;
  return adminEmailMutation(
    request,
    "admin.email.templates.archive",
    "EMAIL_TEMPLATE",
    async ({ session, body, requestId }) => {
      z.object({}).strict().parse(body);
      await createConfiguredEmailCenter().archive(
        session,
        templateId,
        requestId,
      );
      return { ok: true };
    },
  );
}
