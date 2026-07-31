import Image from "next/image";
import { notFound } from "next/navigation";
import { z } from "zod";

import {
  AdminNotFoundError,
  createConfiguredAdminEventDetail,
} from "@/modules/admin";
import { getCurrentUser, requireSuperAdminPrincipal } from "@/modules/auth";

export default async function AdminListingPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const principal = requireSuperAdminPrincipal(await getCurrentUser());
  const id = z
    .string()
    .uuid()
    .safeParse((await params).eventId);
  if (!id.success) notFound();
  let event;
  try {
    event = await createConfiguredAdminEventDetail().get(principal, id.data);
  } catch (error) {
    if (error instanceof AdminNotFoundError) notFound();
    throw error;
  }
  const mode = (await searchParams).mode === "public" ? "public" : "organizer";
  const projection =
    mode === "public" ? event.publication?.snapshot?.projection : null;
  if (mode === "public" && !projection) notFound();
  const title = projection?.title ?? event.title;
  const description = projection?.description ?? event.description;
  const address =
    projection?.address.kind === "EXACT"
      ? `${projection.address.addressLine1}, ${projection.address.city}, ${projection.address.region} ${projection.address.postalCode}`
      : projection?.address.kind === "APPROXIMATE"
        ? projection.address.label
        : projection?.address.kind === "HIDDEN"
          ? `${projection.address.city}, ${projection.address.region} — address hidden until start`
          : event.location?.publicProjection;
  const photos =
    mode === "public" && projection
      ? [
          {
            id: projection.coverPhotoUrl.split("/")[2]!,
            url: projection.coverPhotoUrl,
          },
          ...projection.gallery.map((photo) => ({
            id: photo.id,
            url: photo.url,
          })),
        ]
      : event.photos.flatMap((photo) =>
          photo.previewUrl ? [{ id: photo.id, url: photo.previewUrl }] : [],
        );

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <p className="eyebrow">
            {mode === "public"
              ? "Retained immutable public snapshot"
              : "Current mutable organizer draft"}
          </p>
          <h1>{title}</h1>
          <p>
            Authorized admin-only preview. This does not depend on suppressed
            public or organizer routes.
          </p>
        </div>
      </header>
      <article className="admin-panel admin-preview">
        <p>
          <strong>{address ?? "Location not provided"}</strong>
        </p>
        <p>{description ?? "No description provided."}</p>
        {photos.length ? (
          <div className="admin-preview__gallery">
            {photos.map((photo) => (
              <Image
                alt=""
                height={360}
                key={`${photo.id}-${photo.url}`}
                src={photo.url}
                unoptimized
                width={480}
              />
            ))}
          </div>
        ) : (
          <p>No ready photos.</p>
        )}
      </article>
    </div>
  );
}
