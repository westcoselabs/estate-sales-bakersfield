import { stdout } from "node:process";

import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "../src/generated/prisma/client";
import { SYSTEM_EMAIL_DEFAULTS } from "../src/modules/email/application/defaults";
import {
  emailContentDigest,
  sanitizeEmailHtml,
} from "../src/modules/email/application/rendering";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("DATABASE_URL is required to seed email templates.");
const appEnvironment = process.env.APP_ENV;
const resourceEnvironment = process.env.DATABASE_RESOURCE_ENV ?? appEnvironment;
if (!appEnvironment || appEnvironment !== resourceEnvironment) {
  throw new Error(
    "APP_ENV and DATABASE_RESOURCE_ENV must match before seeding email templates.",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: databaseUrl }),
});
const owner = await prisma.user.findFirst({
  where: {
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    emailVerifiedAt: { not: null },
  },
  select: { id: true },
});
if (!owner)
  throw new Error(
    "An active, verified super-admin must be provisioned before seeding templates.",
  );

for (const [key, definition] of Object.entries(SYSTEM_EMAIL_DEFAULTS)) {
  const html = sanitizeEmailHtml(definition.html);
  const digest = emailContentDigest(definition.subject, html);
  await prisma.$transaction(async (tx) => {
    const template = await tx.emailTemplate.upsert({
      where: { key: key as keyof typeof SYSTEM_EMAIL_DEFAULTS },
      create: {
        key: key as keyof typeof SYSTEM_EMAIL_DEFAULTS,
        name: definition.name,
        category: definition.category,
        draftSubject: definition.subject,
        draftHtml: html,
        draftDigest: digest,
        createdByUserId: owner.id,
      },
      update: {},
      include: { revisions: { take: 1 } },
    });
    if (template.revisions.length) return;
    const revision = await tx.emailTemplateRevision.create({
      data: {
        templateId: template.id,
        revisionNumber: 1,
        subject: definition.subject,
        html,
        contentDigest: digest,
        requiredVariables: [...definition.requiredVariables],
        publishedByUserId: owner.id,
        publishedAt: new Date(),
      },
    });
    await tx.emailTemplate.update({
      where: { id: template.id },
      data: { activeRevisionId: revision.id },
    });
    await tx.auditEntry.create({
      data: {
        actorUserId: owner.id,
        action: "EMAIL_TEMPLATE_SEEDED",
        targetType: "EMAIL_TEMPLATE",
        targetId: template.id,
        metadata: { key, revisionNumber: 1 },
      },
    });
  });
  stdout.write(`Seeded ${key}\n`);
}

await prisma.$disconnect();
