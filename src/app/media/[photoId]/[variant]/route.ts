import { getCurrentUser } from "@/modules/auth";
import {
  createConfiguredEventService,
  EventNotFoundError,
} from "@/modules/events";

const variants = new Set(["thumbnail", "card", "gallery", "cover"] as const);
type Variant = "thumbnail" | "card" | "gallery" | "cover";

interface Context {
  readonly params: Promise<{ photoId: string; variant: string }>;
}

export async function GET(_request: Request, context: Context) {
  try {
    const { photoId, variant } = await context.params;
    if (!variants.has(variant as Variant)) throw new EventNotFoundError();
    const media = await createConfiguredEventService().mediaVariant(
      await getCurrentUser(),
      photoId,
      variant as Variant,
    );
    return new Response(media.stream, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": media.contentType,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
    });
  }
}
