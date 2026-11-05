import { z } from "zod";
import { getCurrentSession, requireSuperAdminPrincipal } from "@/modules/auth";
import {
  createConfiguredAdminRateLimiter,
  enforceAdminRateLimit,
} from "@/modules/admin";
import {
  createContactDirectory,
  previewContactImport,
} from "@/modules/contacts";
import { requestIdFrom } from "@/platform/http/request-context";
import {
  adminApiError,
  adminJson,
  assertAdminOrigin,
  readAdminBoundedJson,
} from "../_shared";

export async function POST(request: Request) {
  const startedAt = performance.now();
  const requestId = requestIdFrom(request);
  try {
    assertAdminOrigin(request);
    const session = await getCurrentSession();
    const administrator = requireSuperAdminPrincipal(
      session?.principal ?? null,
    );
    const body = z
      .object({
        action: z.enum(["preview", "import", "unsubscribe", "export"]),
        input: z.unknown(),
        digest: z.string().optional(),
        id: z.string().optional(),
      })
      .parse(await readAdminBoundedJson(request));
    await enforceAdminRateLimit(
      createConfiguredAdminRateLimiter(),
      body.action === "export"
        ? "EXPORT"
        : body.action === "unsubscribe"
          ? "CONTACT_MANAGEMENT"
          : "CONTACT_IMPORT",
      administrator.id,
    );
    const directory = createContactDirectory();
    if (body.action === "preview") {
      const { parsed, digest } = previewContactImport(body.input);
      return adminJson(
        {
          digest,
          counts: parsed.counts,
          invalid: parsed.invalid.slice(0, 25),
          invalidCount: parsed.invalid.length,
          duplicates: parsed.duplicates,
          total: parsed.rows.length,
          sample: parsed.rows.slice(0, 5),
        },
        { requestId },
      );
    }
    if (body.action === "export") {
      const csv = await directory.export(session, body.input, requestId);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="subscribed-contacts.csv"',
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const result =
      body.action === "import"
        ? await directory.import(
            session,
            body.input,
            body.digest ?? "",
            requestId,
          )
        : await directory.unsubscribe(session, body.id ?? "", requestId);
    return adminJson(result, { requestId });
  } catch (error) {
    return adminApiError(error, requestId, "admin.contacts", startedAt);
  }
}
