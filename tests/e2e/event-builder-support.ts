import { expect, type Page } from "@playwright/test";

export async function completeOrganizerProfile(
  page: Page,
  input: {
    readonly displayName: string;
    readonly contactName: string;
    readonly contactEmail: string;
    readonly website?: string;
  },
): Promise<void> {
  await page.goto("/dashboard/profile");
  await page
    .getByLabel("Business or organizer name (required, shown publicly)")
    .fill(input.displayName);
  await page
    .getByLabel("Contact name (required, kept private)")
    .fill(input.contactName);
  await page
    .getByLabel("Contact email (required, kept private)")
    .fill(input.contactEmail);
  if (input.website) {
    await page.getByLabel("Website (optional)").fill(input.website);
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await page.goto("/dashboard");
}

export async function chooseSingleDaySchedule(
  page: Page,
  dateKey: string,
): Promise<void> {
  const target = new Date(`${dateKey}T12:00:00.000Z`);
  const targetMonth = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(target);
  const targetDay = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(target);
  const calendar = page.getByRole("region", {
    name: "Choose your sale dates",
  });
  const monthHeading = calendar.getByRole("heading", { level: 3 });

  for (let monthOffset = 0; monthOffset < 36; monthOffset += 1) {
    if ((await monthHeading.textContent())?.trim() === targetMonth) break;
    await calendar.getByRole("button", { name: "Next month" }).click();
  }
  await expect(monthHeading).toHaveText(targetMonth);

  const day = calendar.getByRole("button", { name: targetDay });
  await day.click();
  await day.click();
  await expect(
    page.getByRole("region", { name: "Sale schedule details" }),
  ).toContainText("Sale:");
  await expect(page.getByRole("textbox", { name: "Timezone" })).toHaveValue(
    "America/Los_Angeles",
  );
}

export async function choosePhotoCover(
  page: Page,
  photoLabel: string,
): Promise<void> {
  const actions = page.getByRole("button", {
    name: `Actions for ${photoLabel}`,
  });

  await expect(async () => {
    await actions.click();
    await page
      .getByRole("menuitem", { name: "Make cover" })
      .dispatchEvent("click", undefined, { timeout: 500 });
  }).toPass({ timeout: 30_000 });
}
