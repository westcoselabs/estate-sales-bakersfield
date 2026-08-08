import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { PrismaClient } from "@/generated/prisma/client";
import { SYSTEM_EMAIL_DEFAULTS } from "@/modules/email/application/defaults";
import {
  emailContentDigest,
  sanitizeEmailHtml,
} from "@/modules/email/application/rendering";
import { createNeonAdapter } from "@/platform/database/neon-adapter";
import { requireIsolatedTestDatabase } from "../../scripts/test-database-safety";

interface CapturedEmail {
  kind: "EMAIL_VERIFICATION";
  to: string;
  actionUrl: string;
}

const capturePath = path.resolve(".tmp/e2e-auth-emails.jsonl");
const runId = process.env.TEST_RUN_ID;
if (!runId || !/^testrun-[a-z0-9-]+$/.test(runId)) {
  throw new Error("Playwright requires a valid TEST_RUN_ID");
}
const database = requireIsolatedTestDatabase();

async function registerAndVerify(
  page: Page,
  input: {
    email: string;
    name: string;
    password: string;
  },
) {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(input.name);
  await page.getByLabel("Email", { exact: true }).fill(input.email);
  await page.getByLabel("Password", { exact: true }).fill(input.password);
  await page.getByLabel("Confirm password").fill(input.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/verification instructions/i)).toBeVisible();
  let captured: CapturedEmail | undefined;
  await expect
    .poll(async () => {
      const messages = (await readFile(capturePath, "utf8").catch(() => ""))
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as CapturedEmail);
      captured = messages
        .filter((message) => message.to === input.email)
        .at(-1);
      return Boolean(captured);
    })
    .toBe(true);
  const action = new URL(captured!.actionUrl);
  await page.goto(`${action.pathname}${action.search}`);
  await page.getByRole("button", { name: "Verify email" }).click();
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("guards and operates the focused owner portal on desktop and mobile", async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000);
  const suffix = crypto.randomUUID();
  const ownerEmail = `${runId}-admin-${suffix}@example.test`;
  const userEmail = `${runId}-marketing-${suffix}@example.test`;
  const ownerPassword = "super-admin-browser-password";
  const userPassword = "marketing-user-browser-password";

  await page.goto("/admin?private=discard-me");
  await expect(page).toHaveURL(/\/login$/);
  expect(page.url()).not.toContain("private");

  const ordinaryContext = await browser.newContext();
  const ordinaryPage = await ordinaryContext.newPage();
  await registerAndVerify(ordinaryPage, {
    email: userEmail,
    name: "Marketing organizer",
    password: userPassword,
  });
  await login(ordinaryPage, userEmail, userPassword);
  await ordinaryPage.goto("/admin");
  await expect(
    ordinaryPage.getByText("This page could not be found."),
  ).toBeVisible();

  await registerAndVerify(page, {
    email: ownerEmail,
    name: "Website owner",
    password: ownerPassword,
  });
  const prisma = new PrismaClient({
    adapter: createNeonAdapter(database.directUrl),
  });
  const owner = await prisma.user.findUniqueOrThrow({
    where: { normalizedEmail: ownerEmail },
  });
  const ordinary = await prisma.user.findUniqueOrThrow({
    where: { normalizedEmail: userEmail },
  });
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: owner.id },
      data: { role: "SUPER_ADMIN" },
    });
    await transaction.session.deleteMany({ where: { userId: owner.id } });
    await transaction.auditEntry.create({
      data: {
        actorUserId: owner.id,
        action: "SUPER_ADMIN_PROVISIONED",
        targetType: "USER",
        targetId: owner.id,
        metadata: { source: "GUARDED_E2E_FIXTURE" },
      },
    });
    const definition = SYSTEM_EMAIL_DEFAULTS.RECENT_LISTINGS;
    const html = sanitizeEmailHtml(definition.html);
    const template = await transaction.emailTemplate.create({
      data: {
        key: "RECENT_LISTINGS",
        name: definition.name,
        category: definition.category,
        draftSubject: definition.subject,
        draftHtml: html,
        draftDigest: emailContentDigest(definition.subject, html),
        createdByUserId: owner.id,
      },
    });
    const revision = await transaction.emailTemplateRevision.create({
      data: {
        templateId: template.id,
        revisionNumber: 1,
        subject: definition.subject,
        html,
        contentDigest: emailContentDigest(definition.subject, html),
        requiredVariables: [...definition.requiredVariables],
        publishedByUserId: owner.id,
        publishedAt: new Date(),
      },
    });
    await transaction.emailTemplate.update({
      where: { id: template.id },
      data: { activeRevisionId: revision.id },
    });
  });
  const organizer = await prisma.organizerProfile.upsert({
    where: { userId: ordinary.id },
    create: { userId: ordinary.id, status: "INCOMPLETE" },
    update: {},
  });
  const event = await prisma.event.create({
    data: {
      organizerId: organizer.id,
      publicId: crypto.randomUUID().replaceAll("-", "").slice(0, 12),
      slug: "admin-removal-fixture",
      title: "Admin Removal Fixture",
      description: "A retained draft created by the guarded browser fixture.",
      eventType: "ESTATE_SALE",
    },
  });
  await prisma.$disconnect();

  await login(page, ownerEmail, ownerPassword);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Website performance" }),
  ).toBeVisible();
  const desktopNavigation = page.getByRole("navigation", {
    name: "Admin navigation",
  });
  await expect(desktopNavigation).toContainText("Overview");
  await expect(desktopNavigation).toContainText("Users");
  await expect(desktopNavigation).toContainText("Listings");
  await expect(desktopNavigation).toContainText("Email");
  await expect(desktopNavigation).toContainText("Imports");
  await page.getByLabel("Date range").selectOption("7d");
  await page.getByRole("button", { name: "Apply range" }).click();
  await expect(page).toHaveURL(/range=7d/);

  await page.getByRole("link", { name: "Users" }).first().click();
  await page.getByLabel("Search users").fill(userEmail);
  await page.getByLabel("Filter").selectOption("all");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(
    page.getByRole("link", { name: "Marketing organizer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export contacts" }).click();
  await expect(
    page.getByRole("heading", { name: /Export 1 current contacts/ }),
  ).toBeVisible();
  await page.getByLabel("Your password").fill(ownerPassword);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  await download;
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("link", { name: "Marketing organizer" }).click();
  await expect(
    page.getByRole("heading", { name: "Marketing organizer" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Listings" }).first().click();
  await page.getByLabel("Search listings").fill(event.id);
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("link", { name: "Admin Removal Fixture" }).click();
  await expect(
    page.getByRole("heading", { name: "Admin Removal Fixture" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove listing" }).click();
  await page.getByLabel("Removal reason").fill("Owner moderation fixture");
  await page.getByLabel(/Enter Admin Removal Fixture or REMOVE/).fill("REMOVE");
  await page.getByLabel("Your password").fill(ownerPassword);
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/removed/i).first()).toBeVisible();

  await page.getByRole("link", { name: "Email" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Email center" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Manage templates/ }).click();
  await page.getByRole("link", { name: /Recent listings/ }).click();
  await expect(page.getByText("Sanitized email-safe source")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "recent-listings.html",
    mimeType: "text/html",
    buffer: Buffer.from(
      '<!doctype html><html><body><h1>Recent sales</h1>{{{RECENT_LISTINGS_HTML}}}<p><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a></p></body></html>',
    ),
  });
  await expect(page.getByText("Draft autosaved")).toBeVisible();
  await page.getByRole("button", { name: "Send test" }).click();
  await expect(page.getByText("Test sent to your admin email")).toBeVisible();
  await page.getByLabel("Admin password").fill(ownerPassword);
  await page.getByLabel("Type PUBLISH").fill("PUBLISH");
  await page.getByRole("button", { name: "Publish revision" }).click();
  await expect(page.getByText("Template published")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  const mobile = page.getByRole("navigation", {
    name: "Mobile admin navigation",
  });
  await expect(mobile).toBeVisible();
  await expect(mobile.getByRole("link")).toHaveCount(5);
  await expect(mobile).toContainText("Imports");
  await mobile.getByRole("link", { name: "Email" }).click();
  await expect(
    page.getByRole("heading", { name: "Email center" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await ordinaryContext.close();
});
