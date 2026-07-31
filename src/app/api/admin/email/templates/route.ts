import { z } from "zod";
import { createConfiguredEmailCenter } from "@/modules/email";
import { adminEmailMutation } from "../_route";
const schema = z
  .object({
    name: z.string().trim().min(1).max(100),
    subject: z.string().trim().min(1).max(200),
    html: z.string().min(1).max(256_000),
  })
  .strict();
export async function POST(request: Request) {
  return adminEmailMutation(
    request,
    "admin.email.templates.create",
    "EMAIL_TEMPLATE",
    async ({ session, body, requestId }) =>
      createConfiguredEmailCenter().createTemplate(
        session,
        schema.parse(body),
        requestId,
      ),
  );
}
