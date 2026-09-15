import { expect, test } from "@playwright/test";
import { PrismaClient } from "@/generated/prisma/client";
import { createNeonAdapter } from "@/platform/database/neon-adapter";
import { Argon2PasswordHasher } from "@/modules/auth/infrastructure/argon2-password-hasher";
import { requireIsolatedTestDatabase } from "../../scripts/test-database-safety";
import { enrollAdministratorMfa } from "./admin-mfa-support";

test("allows administrator access before optional MFA enrollment and protects enrolled accounts", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const database = requireIsolatedTestDatabase();
  const prisma = new PrismaClient({
    adapter: createNeonAdapter(database.directUrl),
  });
  const email = `${process.env.TEST_RUN_ID}-mfa-${crypto.randomUUID()}@example.test`;
  const password = "administrator-mfa-browser-password";
  const user = await prisma.user.create({
    data: {
      displayName: "MFA browser administrator",
      email,
      normalizedEmail: email,
      passwordHash: await new Argon2PasswordHasher().hash(password),
      emailVerifiedAt: new Date(),
      role: "SUPER_ADMIN",
    },
  });
  const origin = "http://127.0.0.1:3417";
  try {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const reauthenticated = await page.request.post("/api/admin/reauth", {
      headers: { Origin: origin },
      data: { password },
    });
    expect(reauthenticated.status()).toBe(200);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/users/);
    await page.goto("/account/security?next=%2Fadmin");
    await page.screenshot({
      path: testInfo.outputPath("administrator-security.png"),
      fullPage: true,
      mask: [page.locator('input[type="password"]')],
    });
    const before = await page.context().cookies();
    const enrollment = await enrollAdministratorMfa(page, password, testInfo);
    await expect(page).toHaveURL(/\/admin$/);
    const after = await page.context().cookies();
    expect(
      before.find((cookie) => cookie.name.includes("session"))?.value ===
        after.find((cookie) => cookie.name.includes("session"))?.value,
    ).toBe(false);

    // A password-only new session has no administrator capability.
    await page.request.post("/api/auth/logout", {
      headers: { Origin: origin },
    });
    await page.request.post("/api/auth/login", {
      headers: { Origin: origin },
      data: { email, password },
    });
    const securityResponse = await page.goto("/account/security?next=%2Fadmin");
    expect(securityResponse?.headers()["cache-control"]).toContain("no-store");
    expect(securityResponse?.headers()["referrer-policy"]).toBe("no-referrer");
    await page
      .getByRole("button", { name: "Use a recovery code", exact: true })
      .click();
    await page
      .getByLabel("Recovery code", { exact: true })
      .fill(enrollment.recoveryCodes[0]!);
    await page
      .getByRole("button", { name: "Verify code", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Continue to administrator" }),
    ).toBeVisible();
    const replay = await page.request.post("/api/auth/mfa", {
      headers: { Origin: origin },
      data: {
        action: "challenge",
        code: enrollment.recoveryCodes[0],
        recovery: true,
      },
    });
    expect(replay.status()).toBe(401);
    expect(replay.headers()["cache-control"]).toContain("no-store");
    await page
      .getByRole("button", { name: "Continue to administrator" })
      .click();
    await expect(page).toHaveURL(/\/admin$/);
  } finally {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: "USER" },
    });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.$disconnect();
  }
});
