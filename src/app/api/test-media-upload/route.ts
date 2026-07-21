import {
  createConfiguredTestMediaStore,
  MediaStoreError,
} from "@/modules/media";

export async function PUT(request: Request) {
  try {
    await createConfiguredTestMediaStore().acceptAuthorizedUpload(request);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof MediaStoreError ? 400 : 404;
    return Response.json(
      { error: "The test upload was rejected." },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
