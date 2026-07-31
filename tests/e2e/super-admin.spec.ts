import { readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaNeon } from "@prisma/adapter-neon";
import { expect, test, type Page } from "@playwright/test";

import { PrismaClient } from "@/generated/prisma/client";
import {
  loadDedicatedTestEnvironment,
  requireSafeTestDatabase,
} from "../../scripts/test-database-safety";

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
loadDedicatedTestEnvironment();
const database = requireSafeTestDatabase();

async function registerAndVerify(
  page: Page,
  input: {
    email: string;
    name: string;
    password: string;
    marketing?: boolean;
  },
) {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(input.name);
  await page.getByLabel("Email").fill(input.email);
  await page.getByLabel("Password", { exact: true }).fill(input.password);
  await page.getByLabel("Confirm password").fill(input.password);
  if (input.marketing) {
    await page.getByLabel(/Email me occasional updates/).check();
  }
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
    marketing: true,
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
    adapter: new PrismaNeon({ connectionString: database.pooledUrl }),
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
  await page.getByLabel("Date range").selectOption("7d");
  await page.getByRole("button", { name: "Apply range" }).click();
  await expect(page).toHaveURL(/range=7d/);

  await page.getByRole("link", { name: "Users" }).first().click();
  await page.getByLabel("Search users").fill(userEmail);
  await page.getByLabel("Filter").selectOption("marketing");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(
    page.getByRole("link", { name: "Marketing organizer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export eligible contacts" }).click();
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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  const mobile = page.getByRole("navigation", {
    name: "Mobile admin navigation",
  });
  await expect(mobile).toBeVisible();
  await expect(mobile.getByRole("link")).toHaveCount(3);
  await ordinaryContext.close();
});
