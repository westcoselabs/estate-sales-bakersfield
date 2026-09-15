import { expect, test } from "@playwright/test";

test("serves curated date hubs with canonical metadata while preserving beta exclusion", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const path of [
      "/estate-sales/this-weekend",
      "/yard-sales/this-weekend",
      "/sales-today",
    ]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${path}$`),
      );
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        /noindex, follow/,
      );
      await expect(
        page.getByText("Bakersfield local time", { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Before you visit" }),
      ).toBeVisible();
    }
    expect((await request.get("/sitemap.xml")).status()).toBe(404);
    expect((await request.get("/sitemaps/pages.xml")).status()).toBe(404);
    expect(await (await request.get("/robots.txt")).text()).not.toContain(
      "Sitemap:",
    );
  } finally {
    await context.close();
  }
});
