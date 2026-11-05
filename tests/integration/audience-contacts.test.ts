import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { CurrentSession } from "@/modules/auth";
import {
  ContactDirectory,
  previewContactImport,
} from "@/modules/contacts/infrastructure/contact-directory";
import { createIntegrationClient } from "./support/database";
import { administratorMfaProof } from "./support/admin-mfa-fixtures";

const prisma = createIntegrationClient();
const directory = new ContactDirectory(prisma);
const tag = `contact-test-${randomUUID()}`;
let session: CurrentSession;
const payload = (csv: string, sourceTag = tag) => ({
  csv,
  sourceTag,
  category: "ATTENDEE",
  consentConfirmed: true,
});
const save = (raw: unknown, actor = session) =>
  directory.import(actor, raw, previewContactImport(raw).digest, randomUUID());

beforeAll(async () => {
  const email = `${randomUUID()}@example.com`;
  const user =
    (await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } })) ??
    (await prisma.user.create({
      data: {
        displayName: "Contact administrator",
        email,
        normalizedEmail: email,
        passwordHash: "fixture-only",
        emailVerifiedAt: new Date(),
        role: "SUPER_ADMIN",
      },
    }));
  const stored = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: randomBytes(32).toString("hex"),
      expiresAt: new Date(Date.now() + 3_600_000),
      passwordAuthenticatedAt: new Date(),
      ...(await administratorMfaProof(prisma, user.id)),
    },
  });
  session = { ...stored, principal: user, metadata: {} };
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("external audience contacts", () => {
  it("imports once, keeps opt-outs sticky, filters and exports without creating users or send jobs", async () => {
    const email = `${randomUUID()}@example.com`;
    const cleaned = `${randomUUID()}@example.com`;
    const subscribed = `${randomUUID()}@example.com`;
    const raw = payload(
      `email,status\n${email},SUBSCRIBED\n${cleaned},CLEANED\n${subscribed},SUBSCRIBED`,
    );
    const initialUsers = await prisma.user.count();
    const initialJobs = await prisma.durableJob.count();
    expect(await save(raw)).toMatchObject({ created: 3, suppressed: 1 });
    expect(await save(raw)).toMatchObject({ alreadyImported: true });
    expect(await prisma.user.count()).toBe(initialUsers);
    expect(await prisma.durableJob.count()).toBe(initialJobs);
    const contact = await prisma.audienceContact.findUniqueOrThrow({
      where: { email },
    });
    await directory.unsubscribe(session, contact.id, randomUUID());
    await save(
      payload(
        `email,status\n${email},SUBSCRIBED\n${cleaned},SUBSCRIBED`,
        `${tag}-second`,
      ),
    );
    expect(
      (await prisma.audienceContact.findUniqueOrThrow({ where: { email } }))
        .status,
    ).toBe("UNSUBSCRIBED");
    expect(
      (
        await prisma.audienceContact.findUniqueOrThrow({
          where: { email: cleaned },
        })
      ).status,
    ).toBe("CLEANED");
    expect(
      (
        await directory.list(session, {
          sourceTag: tag,
          category: "BUSINESS_OWNER",
        })
      ).total,
    ).toBe(0);
    expect(
      (await directory.list(session, { sourceTag: tag, status: "SUBSCRIBED" }))
        .total,
    ).toBe(1);
    const exported = await directory.export(
      session,
      { sourceTag: tag },
      randomUUID(),
    );
    expect(exported).toContain(subscribed);
    expect(exported).not.toContain(email);
    expect(exported).not.toContain(cleaned);
  });

  it("requires consent, unchanged preview and a live administrator session", async () => {
    const raw = payload(`email,status\n${randomUUID()}@example.com,SUBSCRIBED`);
    await expect(save({ ...raw, consentConfirmed: false })).rejects.toThrow(
      /permission/i,
    );
    await expect(
      directory.import(session, raw, "stale", randomUUID()),
    ).rejects.toThrow(/Preview/);
    await expect(save(raw, { ...session, id: randomUUID() })).rejects.toThrow(
      /expired/,
    );
    await expect(directory.list(null, {})).rejects.toThrow();
  });

  it("preserves the existing category when adding another partner source", async () => {
    const email = `${randomUUID()}@example.com`;
    const raw = payload(`email,status\n${email},UNSUBSCRIBED`);
    await save({ ...raw, category: "BUSINESS_OWNER" });
    await save({ ...raw, sourceTag: `${tag}-new` });
    expect(
      await prisma.audienceContact.findUniqueOrThrow({ where: { email } }),
    ).toMatchObject({
      category: "BUSINESS_OWNER",
      sourceTags: [tag, `${tag}-new`],
    });
  });

  it("serializes concurrent imports without reactivating a suppressed address", async () => {
    const email = `${randomUUID()}@example.com`;
    await Promise.all([
      save(payload(`email,status\n${email},SUBSCRIBED`, `${tag}-concurrent-a`)),
      save(
        payload(`email,status\n${email},UNSUBSCRIBED`, `${tag}-concurrent-b`),
      ),
    ]);
    expect(
      await prisma.audienceContact.findUniqueOrThrow({ where: { email } }),
    ).toMatchObject({ status: "UNSUBSCRIBED" });
  });

  it("excludes a later account opt-out and rejects stale export authentication", async () => {
    const email = `${randomUUID()}@example.com`;
    await save(payload(`email,status\n${email},SUBSCRIBED`, `${tag}-account`));
    await prisma.user.create({
      data: {
        displayName: "Opted out",
        email,
        normalizedEmail: email,
        passwordHash: "fixture-only",
        marketingPreference: { create: { unsubscribedAt: new Date() } },
      },
    });
    expect(
      await directory.export(
        session,
        { sourceTag: `${tag}-account` },
        randomUUID(),
      ),
    ).not.toContain(email);
    const stored = await prisma.session.create({
      data: {
        userId: session.userId,
        tokenHash: randomBytes(32).toString("hex"),
        expiresAt: new Date(Date.now() + 3_600_000),
        passwordAuthenticatedAt: new Date(Date.now() - 3_600_000),
      },
    });
    await expect(
      directory.export({ ...session, id: stored.id }, {}, randomUUID()),
    ).rejects.toThrow();
  });
});
