import { z } from "zod";

import {
  futurePublicEventProjection,
  publicEventProjection,
  type EventRecord,
} from "@/modules/events";

import type { PublicationSnapshot, PublishedListing } from "../domain/types";

const exactAddressSchema = z.object({
  kind: z.literal("EXACT"),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(100).nullable(),
  city: z.string().min(1).max(100),
  region: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  countryCode: z.string().length(2),
});

const addressSchema = z.discriminatedUnion("kind", [
  exactAddressSchema,
  z.object({
    kind: z.literal("APPROXIMATE"),
    city: z.string().min(1).max(100),
    region: z.string().min(1).max(100),
    countryCode: z.string().length(2),
    label: z.string().min(1).max(250),
  }),
  z.object({
    kind: z.literal("HIDDEN"),
    city: z.string().min(1).max(100),
    region: z.string().min(1).max(100),
    countryCode: z.string().length(2),
    releasesAt: z.iso.datetime(),
  }),
]);

const publicProjectionSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(5000),
  eventType: z.enum(["ESTATE_SALE", "YARD_SALE"]),
  path: z
    .string()
    .regex(/^\/(?:estate-sales|yard-sales)\/[a-z0-9-]+-[0-9a-f]{12}$/),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timezone: z.string().min(1).max(64),
  localStartsAt: z.string().min(1).max(16),
  localEndsAt: z.string().min(1).max(16),
  address: addressSchema,
  organizer: z.object({
    displayName: z.string().min(1).max(100).nullable(),
    websiteUrl: z.url().nullable(),
  }),
  coverPhotoUrl: z.string().regex(/^\/media\/[A-Za-z0-9-]+\/cover$/),
  gallery: z.array(
    z.object({
      id: z.string().min(1).max(100),
      url: z.string().regex(/^\/media\/[A-Za-z0-9-]+\/gallery$/),
      position: z.number().int().nonnegative(),
    }),
  ),
});

const publicationSnapshotSchema = z.object({
  schema: z.literal("estate-sales-publication-v1"),
  privacyMode: z.enum([
    "EXACT_ADDRESS",
    "APPROXIMATE_LOCATION",
    "HIDDEN_UNTIL_START",
  ]),
  projection: publicProjectionSchema,
});

export function createPublicationSnapshot(
  event: EventRecord,
): PublicationSnapshot {
  if (!event.privacyMode) {
    throw new Error("Publication snapshot requires an address privacy mode");
  }
  return publicationSnapshotSchema.parse({
    schema: "estate-sales-publication-v1",
    privacyMode: event.privacyMode,
    projection: futurePublicEventProjection(event),
  });
}

export function parsePublicationSnapshot(value: unknown): PublicationSnapshot {
  return publicationSnapshotSchema.parse(value);
}

export function projectionAt(
  snapshot: PublicationSnapshot,
  now: Date,
): PublicationSnapshot["projection"] {
  const projection = snapshot.projection;
  if (
    snapshot.privacyMode !== "HIDDEN_UNTIL_START" ||
    now.getTime() >= new Date(projection.startsAt).getTime() ||
    projection.address.kind !== "EXACT"
  ) {
    return projection;
  }
  return {
    ...projection,
    address: {
      kind: "HIDDEN",
      city: projection.address.city,
      region: projection.address.region,
      countryCode: projection.address.countryCode,
      releasesAt: projection.startsAt,
    },
  };
}

export function publishedListing(input: {
  readonly eventId: string;
  readonly approvedRevision: number;
  readonly canonicalPath: string;
  readonly publishedAt: Date;
  readonly verifiedEmail: string | null;
  readonly snapshot: unknown;
  readonly now: Date;
}): PublishedListing {
  const snapshot = parsePublicationSnapshot(input.snapshot);
  return {
    eventId: input.eventId,
    approvedRevision: input.approvedRevision,
    canonicalPath: input.canonicalPath,
    publishedAt: input.publishedAt,
    verifiedEmail: input.verifiedEmail,
    projection: projectionAt(snapshot, input.now),
  };
}

export function currentPublicProjection(event: EventRecord, now: Date) {
  return publicEventProjection(event, now);
}
