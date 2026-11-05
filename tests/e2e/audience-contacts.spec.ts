import { expect, test } from "@playwright/test";
import { PrismaClient } from "@/generated/prisma/client";
import { createNeonAdapter } from "@/platform/database/neon-adapter";
import { Argon2PasswordHasher } from "@/modules/auth/infrastructure/argon2-password-hasher";
import { requireIsolatedTestDatabase } from "../../scripts/test-database-safety";

test("imports an attendee audience and filters suppressed contacts on desktop and mobile", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const database = requireIsolatedTestDatabase();
  const prisma = new PrismaClient({
    adapter: createNeonAdapter(database.directUrl),
  });
  const email = `${process.env.TEST_RUN_ID}-contacts-${crypto.randomUUID()}@example.test`;
  const password = "contacts-browser-administrator";
  await prisma.user.create({
    data: {
      displayName: "Contacts administrator",
      email,
      normalizedEmail: email,
      passwordHash: await new Argon2PasswordHasher().hash(password),
      emailVerifiedAt: new Date(),
      role: "SUPER_ADMIN",
    },
  });
  try {
    await page.goto("/admin/contacts");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/admin/contacts");
    await page.getByText("Import contacts from CSV", { exact: true }).click();
    await page.getByLabel("CSV file", { exact: true }).setInputFiles({
      name: "audience.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "email,first_name,last_name,status\nattendee@example.test,Alex,Attendee,SUBSCRIBED\noptout@example.test,Sam,Suppressed,UNSUBSCRIBED\ncleaned@example.test,Casey,Cleaned,CLEANED",
      ),
    });
    await page
      .getByLabel("Partner / source tag", { exact: true })
      .fill("Simply Decorated test");
    await page.getByLabel(/I confirm the subscribed contacts/).check();
    await page.getByRole("button", { name: "Preview import" }).click();
    await expect(
      page.getByRole("heading", { name: "3 unique contacts" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save contacts", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Saved 3 new contacts",
    );
    await expect(page.getByRole("table")).toContainText(
      "attendee@example.test",
    );
    await page.screenshot({
      path: testInfo.outputPath("contacts-desktop.png"),
      fullPage: true,
    });
    await page
      .getByRole("combobox", { name: "Category", exact: true })
      .selectOption("BUSINESS_OWNER");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(
      page.getByText("No contacts match. Import a CSV or adjust the filters."),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Category", exact: true })
      .selectOption("ATTENDEE");
    await page
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption("SUBSCRIBED");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByRole("table")).toContainText(
      "attendee@example.test",
    );
    await expect(page.getByRole("table")).not.toContainText(
      "optout@example.test",
    );
    await page.getByRole("button", { name: "Export subscribed CSV" }).click();
    await page.getByLabel("Your password").fill(password);
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download CSV", exact: true })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("subscribed-contacts.csv");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page
        .getByRole("navigation", { name: "Mobile admin navigation" })
        .getByRole("link", { name: "Contacts", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("contacts-mobile.png"),
      fullPage: true,
    });
  } finally {
    await prisma.$disconnect();
  }
});
