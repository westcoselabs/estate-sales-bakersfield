import { randomUUID } from "node:crypto";

import { benchmarkArgon2 } from "@/modules/auth";
import { getServerEnvironment } from "@/platform/config/env";
import { hasValidBearerSecret } from "@/platform/security/bearer-secret";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const environment = getServerEnvironment();
  const headers = { "cache-control": "no-store", "x-request-id": requestId };

  if (environment.APP_ENV === "production") {
    return Response.json(
      { requestId, error: "Not found" },
      { status: 404, headers },
    );
  }
  if (
    !environment.CRON_SECRET ||
    !hasValidBearerSecret(
      request.headers.get("authorization"),
      environment.CRON_SECRET,
    )
  ) {
    return Response.json(
      { requestId, error: "Unauthorized" },
      { status: 401, headers },
    );
  }

  return Response.json(
    { requestId, ...(await benchmarkArgon2(3)) },
    { headers },
  );
}
