import { requireUser } from "@/modules/auth";
import {
  createConfiguredOrganizerService,
  organizerProfileSchema,
} from "@/modules/organizers";
import { requestIdFrom } from "@/platform/http/request-context";

import {
  assertAuthenticationOrigin,
  authenticationApiError,
  authJson,
  readJson,
} from "../auth/_shared";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    const user = await requireUser();
    const organizer = await createConfiguredOrganizerService().getForUser(
      user.id,
    );
    return authJson({ organizer, requestId }, { requestId });
  } catch (error) {
    return authenticationApiError(error, request, "organizer.read");
  }
}

export async function PUT(request: Request) {
  const requestId = requestIdFrom(request);
  try {
    assertAuthenticationOrigin(request);
    const user = await requireUser();
    const input = organizerProfileSchema.parse(await readJson(request));
    const organizer = await createConfiguredOrganizerService().saveForUser(
      user.id,
      input,
      { requestId },
    );
    return authJson({ organizer, requestId }, { requestId });
  } catch (error) {
    return authenticationApiError(error, request, "organizer.save");
  }
}
