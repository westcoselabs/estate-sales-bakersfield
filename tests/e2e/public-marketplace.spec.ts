import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const screenshotDirectory = path.resolve(".tmp/ui-review/public-marketplace");

const publicRoutes = [
  "/",
  "/estate-sales",
  "/yard-sales",
  "/how-it-works",
  "/list-your-sale",
  "/about",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
  "/search",
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

test.beforeAll(async () => {
  await mkdir(screenshotDirectory, { recursive: true });
});

test("serves the complete public route set with unique metadata", async ({
  page,
}) => {
  const titles = new Set<string>();

  for (const route of publicRoutes) {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} should return successfully`).toBe(true);
    await expect(page.locator("h1")).toHaveCount(1);
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    expect(titles.has(title), `${route} should have a unique title`).toBe(
      false,
    );
    titles.add(title);
    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute("href");
    if (!canonical) throw new Error(`${route} is missing a canonical URL`);
    expect(new URL(canonical).pathname).toBe(route);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex, follow/i,
    );
  }
});

test("keeps category hubs and map presentation in one shared search", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Explore", exact: true }),
  ).toHaveAttribute("href", "/search");
  await expect(
    page.getByRole("link", { name: "Map preview", exact: true }),
  ).toHaveCount(0);

  await page.goto("/estate-sales");
  await expect(
    page.getByRole("link", { name: /Browse estate-sale results/ }),
  ).toHaveAttribute("href", "/search?sale=estate");

  await page.goto("/yard-sales");
  await expect(
    page.getByRole("link", { name: /Browse yard-sale results/ }),
  ).toHaveAttribute("href", "/search?sale=yard");

  await page.goto("/search?view=map");
  await expect(
    page.getByText("The interactive map is not available yet"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Map View" }).first(),
  ).toHaveAttribute("aria-pressed", "true");
});

test("renders public discovery content without client JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Find local sales and one-of-a-kind finds near you",
    }),
  ).toBeVisible();
  await page.goto("/search?sale=estate&date=weekend");
  await expect(
    page.getByRole("heading", { name: /sales shown|No sales shown/ }),
  ).toBeVisible();
  await context.close();
});

test("normalizes filter URLs, restores browser history, and loads no map provider resources in list view", async ({
  page,
}) => {
  await page.goto("/search?view=list");
  await page.getByRole("button", { name: "Estate sales" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("sale"))
    .toBe("estate");
  await page.getByRole("button", { name: "Today" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("date"))
    .toBe("today");

  await page.goBack();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("sale"))
    .toBe("estate");
  expect(new URL(page.url()).searchParams.has("date")).toBe(false);
  await expect(
    page.getByRole("button", { name: "Estate sales", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  const resourceUrls = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name.toLowerCase()),
  );
  expect(
    resourceUrls.some((url) =>
      /mapbox|api\.mapbox\.com|tiles\.mapbox|openfreemap|map-style/.test(url),
    ),
  ).toBe(false);
});

test("restores custom date inputs after browser Back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search?view=list");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("button", { name: "Choose dates" }).click();
  await page.getByLabel("Start date").fill("2026-08-12");
  await page.getByLabel("End date").fill("2026-08-14");
  await page.getByRole("button", { name: "Apply filters" }).click();

  await expect
    .poll(() => new URL(page.url()).searchParams.get("date"))
    .toBe("custom");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("from"))
    .toBe("2026-08-12");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("to"))
    .toBe("2026-08-14");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page
    .getByRole("dialog", { name: "Filter sales" })
    .getByRole("button", { name: "Today" })
    .click();
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("date"))
    .toBe("today");

  await page.goBack();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("date"))
    .toBe("custom");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByLabel("Start date")).toHaveValue("2026-08-12");
  await expect(page.getByLabel("End date")).toHaveValue("2026-08-14");
});

test("uses an accessible mobile filter sheet and returns focus on close", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search");
  const trigger = page.getByRole("button", { name: /^Filters/ });
  await trigger.click();
  await expect(
    page.getByRole("dialog", { name: "Filter sales" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Filter sales" }),
  ).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("keeps the professional service path separate and explicit", async ({
  page,
}) => {
  await page.goto("/list-your-sale");
  const serviceLink = page.getByRole("link", {
    name: /Explore Simply Decorated estate-sale services/,
  });
  await expect(serviceLink).toHaveAttribute(
    "href",
    "https://decoratedbyriley.com/estate-sale-companies-bakersfield/",
  );
  await expect(serviceLink).toHaveAttribute("target", "_blank");
  await expect(serviceLink).toHaveAttribute("rel", /noopener/);
  await expect(serviceLink).toHaveAttribute("rel", /noreferrer/);
});

test("serves narrow shared list and map projections", async ({ request }) => {
  const listResponse = await request.get(
    "/api/search?sale=estate&date=next-7-days&view=list",
  );
  expect(listResponse.status()).toBe(200);
  expect(listResponse.headers()["cache-control"]).toContain("no-store");
  await expect(listResponse.json()).resolves.toMatchObject({
    schema: "public-search-v1",
    criteria: {
      sale: "estate",
      date: "next-7-days",
      location: "bakersfield-ca",
      sort: "soonest",
      view: "list",
    },
    items: expect.any(Array),
    markers: expect.any(Array),
    pageInfo: {
      hasNext: expect.any(Boolean),
    },
  });

  const response = await request.get("/api/search?projection=map");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  await expect(response.json()).resolves.toMatchObject({
    schema: "public-search-v1",
    criteria: { view: "map" },
    items: expect.any(Array),
    markers: expect.any(Array),
  });
});

test("switches presentation in URL history without a second search navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/search?view=list");
  const searchNavigations: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === "/search" &&
      ["document", "fetch"].includes(request.resourceType())
    ) {
      searchNavigations.push(request.url());
    }
  });

  await page.getByRole("button", { name: "Map View" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("view"))
    .toBe(null);
  await expect(page.getByRole("button", { name: "Map View" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(searchNavigations).toEqual([]);

  await page.goBack();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("view"))
    .toBe("list");
  await expect(page.getByRole("button", { name: "List View" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("uses a two-action mobile dock and preserves filters across modes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search?view=list");
  const dock = page.locator(".mobile-explore-dock");
  await expect(dock).toBeVisible();
  await expect(dock.locator("button")).toHaveCount(2);
  await expect(dock.getByRole("button", { name: "Map View" })).toBeVisible();
  await expect(dock.getByRole("button", { name: "List View" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.locator('.explore-mobile-toolbar [aria-label="Sort results"]'),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page
    .getByRole("dialog", { name: "Filter sales" })
    .getByRole("button", { name: "Estate sales" })
    .click();
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("sale"))
    .toBe("estate");

  await dock.getByRole("button", { name: "Map View" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("sale"))
    .toBe("estate");
  await expect(
    page.locator('.explore-mobile-toolbar [aria-label="Sort results"]'),
  ).toHaveCount(0);
  await expect(dock.locator("button")).toHaveCount(2);
});

test("keeps unsupported mockup treatments out of result cards", async ({
  page,
}) => {
  await page.goto("/search?view=list");
  await expect(page.getByText(/Featured/i)).toHaveCount(0);
  await expect(page.locator('[class*="listing-card__type"]')).toHaveCount(0);
  await expect(page.locator('[class*="listing-card__tag"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /favorite/i })).toHaveCount(0);
});

test("keeps map controls reachable and final mobile content clear of the dock", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search");
  const controls = page.locator(".maplibregl-ctrl-top-right");
  if ((await controls.count()) > 0) {
    await expect(controls).toBeVisible();
    const box = await controls.boundingBox();
    expect(box?.x).toBeGreaterThan(280);
    expect(box?.y).toBeLessThan(180);
  }

  await page.getByRole("button", { name: "List View" }).last().click();
  const cards = page.locator('[data-result-card="true"]');
  if ((await cards.count()) > 0) {
    await cards.last().scrollIntoViewIfNeeded();
    const cardBox = await cards.last().boundingBox();
    const dockBox = await page.locator(".mobile-explore-dock").boundingBox();
    expect((cardBox?.y ?? 0) + (cardBox?.height ?? 0)).toBeLessThanOrEqual(
      dockBox?.y ?? 0,
    );
  }
});

test("removes nonessential Explore motion when reduced motion is requested", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/search?view=list");
  const transitionDuration = await page
    .getByRole("button", { name: "List View" })
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(transitionDuration).toBe("0s");
});

const requiredExploreShots = [
  { name: "mobile-map", route: "/search", width: 390, height: 844 },
  {
    name: "mobile-list",
    route: "/search?view=list",
    width: 390,
    height: 844,
  },
  { name: "tablet-map", route: "/search", width: 768, height: 1024 },
  { name: "desktop-map", route: "/search", width: 1440, height: 900 },
  {
    name: "desktop-list",
    route: "/search?view=list",
    width: 1440,
    height: 900,
  },
] as const;

for (const shot of requiredExploreShots) {
  test(`captures required Explore smoke view: ${shot.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(shot.route);
    await expect(page.getByRole("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: path.join(screenshotDirectory, `required-${shot.name}.png`),
      fullPage: false,
      animations: "disabled",
    });
  });
}

for (const width of [360, 390, 430, 768, 1280, 1440]) {
  test(`public home and search are stable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({
      width,
      height: width < 768 ? 844 : 900,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const [name, route] of [
      ["home", "/"],
      ["search", "/search?view=map"],
    ] as const) {
      await page.goto(route);
      if (name === "home") {
        await expect
          .poll(() =>
            page
              .locator(".home-hero__media img")
              .evaluate((image) => (image as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        await expect(
          page.locator(".selected-listings .market-listing-card--skeleton"),
        ).toHaveCount(0);
      } else {
        await expect(
          page.getByText("Loading the next available sale results."),
        ).toHaveCount(0, { timeout: 15_000 });
        const searchArea = page.getByRole("button", {
          name: "Search this area",
        });
        if ((await searchArea.count()) > 0) {
          await expect(searchArea).toBeEnabled();
        }
      }
      await expectNoHorizontalOverflow(page);
      await expect(page.getByRole("main")).toBeVisible();
      await page.screenshot({
        path: path.join(screenshotDirectory, `${name}-${String(width)}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  });
}
