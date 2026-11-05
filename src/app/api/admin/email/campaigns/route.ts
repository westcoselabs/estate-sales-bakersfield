import {
  createConfiguredEmailCenter,
  createCampaignSchema,
  type CreateCampaignInput,
} from "@/modules/email";
import { adminEmailMutation } from "../_route";
export async function POST(request: Request) {
  return adminEmailMutation(
    request,
    "admin.email.campaigns.create",
    "EMAIL_CAMPAIGN",
    async ({ session, body, requestId }) => {
      const input = createCampaignSchema.parse(body) as CreateCampaignInput;
      return createConfiguredEmailCenter().createCampaign(
        session,
        input,
        requestId,
      );
    },
  );
}
