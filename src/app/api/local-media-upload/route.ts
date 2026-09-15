import {
  createConfiguredLocalMediaStore,
  MediaStoreError,
} from "@/modules/media";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    await createConfiguredLocalMediaStore().acceptAuthorizedUpload(request);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: "The photo upload was rejected. Please retry." },
      {
        status: error instanceof MediaStoreError ? 400 : 404,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
