import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function renderAdminFixture(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  const [globalCss, css, fullLogo, compactLogo] = await Promise.all([
    readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8"),
    readFile(path.join(process.cwd(), "src/app/foundation.css"), "utf8"),
    readFile(path.join(process.cwd(), "public/images/Logo-gold-white-01.webp")),
    readFile(path.join(process.cwd(), "public/images/Logo-gold-white-02.webp")),
  ]);
  const fullLogoUrl = `data:image/webp;base64,${fullLogo.toString("base64")}`;
  const compactLogoUrl = `data:image/webp;base64,${compactLogo.toString("base64")}`;
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${globalCss}\n${css}
          :root { --font-manrope: Arial; }
        </style>
      </head>
      <body>
        <div class="admin-app">
          <a class="skip-link" href="#main-content">Skip to main content</a>
          <aside class="admin-sidebar">
            <div class="admin-sidebar__brand">
              <a class="brand admin-brand" href="#" aria-label="Estate Sales Bakersfield owner overview"><picture class="brand__logo"><source media="(max-width: 767px)" srcset="${compactLogoUrl}"><img alt="" class="brand__logo-image" height="340" src="${fullLogoUrl}" width="2000"></picture></a>
              <span>Owner control center</span>
            </div>
            <div class="admin-sidebar__identity">
              <span class="admin-sidebar__identity-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 20 7v5c0 5-3 8-8 10-5-2-8-5-8-10V7l8-4Z" fill="none" stroke="currentColor"/></svg></span>
              <span><small>Secure session</small><strong>Super administrator</strong></span>
            </div>
            <div class="admin-sidebar__navigation">
              <span class="admin-sidebar__label">Workspace</span>
              <nav aria-label="Admin navigation">
                <a class="admin-nav-link" aria-current="page" href="#"><span>Overview</span></a>
                <a class="admin-nav-link" href="#"><span>Users</span></a>
                <a class="admin-nav-link" href="#"><span>Listings</span></a>
                <a class="admin-nav-link" href="#"><span>Email</span></a>
                <a class="admin-nav-link" href="#"><span>Imports</span></a>
              </nav>
            </div>
            <div class="admin-sidebar__secondary">
              <span class="admin-sidebar__label">Website</span>
              <a href="#">View website</a>
              <a href="#">Admin account</a>
              <details class="account-menu account-menu--admin"><summary aria-label="Open account menu for Brandon Reed"><span class="account-avatar account-avatar--medium" role="img">BR</span><span class="account-menu__name">Brandon Reed</span><svg class="account-menu__chevron" viewBox="0 0 24 24" width="16" height="16"><path d="m7.5 9.5 4.5 4.5 4.5-4.5" fill="none" stroke="currentColor"/></svg></summary><div class="account-menu__popover"><div class="account-menu__identity"><span class="account-avatar account-avatar--large">BR</span><span><strong>Brandon Reed</strong><small>Account</small></span></div><a href="#">Dashboard</a><a href="#">Profile</a><button>Log out</button></div></details>
            </div>
          </aside>
          <header class="admin-topbar">
            <a class="brand admin-brand" href="#" aria-label="Estate Sales Bakersfield owner overview"><picture class="brand__logo"><source media="(max-width: 767px)" srcset="${compactLogoUrl}"><img alt="" class="brand__logo-image" height="340" src="${fullLogoUrl}" width="2000"></picture></a>
            <div class="admin-topbar__actions"><span>Owner portal</span><a class="admin-topbar__security" href="#"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 21.25c5-2.1 7.5-5.4 7.5-9.9V5.6L12 2.75 4.5 5.6v5.75c0 4.5 2.5 7.8 7.5 9.9Z" fill="none" stroke="currentColor"/></svg><span>Security</span></a><details class="account-menu account-menu--admin"><summary aria-label="Open account menu for Brandon Reed"><span class="account-avatar account-avatar--medium" role="img">BR</span><span class="account-menu__name">Brandon Reed</span><svg class="account-menu__chevron" viewBox="0 0 24 24" width="16" height="16"><path d="m7.5 9.5 4.5 4.5 4.5-4.5" fill="none" stroke="currentColor"/></svg></summary><div class="account-menu__popover"><div class="account-menu__identity"><span class="account-avatar account-avatar--large">BR</span><span><strong>Brandon Reed</strong><small>Account</small></span></div><a href="#">Dashboard</a><a href="#">Profile</a><button>Log out</button></div></details></div>
          </header>
          <main class="admin-main" id="main-content">
            <div class="admin-page">
              <header class="admin-page-header">
                <div>
                  <div class="admin-page-header__kicker">
                    <p class="eyebrow">Owner overview</p>
                    <span class="admin-live-indicator"><span></span>PostgreSQL reporting truth</span>
                  </div>
                  <h1>Website performance</h1>
                  <p>A clear view of revenue, organizer momentum, and listing health.</p>
                </div>
                <form class="admin-range-form">
                  <label class="ui-field">
                    <span class="ui-field__label">Date range</span>
                    <select class="ui-input"><option>Last 30 days</option></select>
                  </label>
                  <button class="ui-button ui-button--secondary" type="button">Apply range</button>
                </form>
              </header>
              <section class="admin-metric-grid" aria-label="Website metrics">
                ${[
                  [
                    "Gross paid revenue",
                    "$18,420",
                    "$69 average purchase",
                    "gold",
                  ],
                  ["Successful purchases", "267", "Last 30 days", "green"],
                  ["New users", "148", "1,924 registered total", "sage"],
                  [
                    "Active public listings",
                    "42",
                    "54 published · 3 canceled",
                    "stone",
                  ],
                ]
                  .map(
                    ([label, value, detail, tone]) => `
                      <article class="admin-metric-card admin-metric-card--${tone}">
                        <div class="admin-metric-card__top">
                          <span class="admin-metric-card__label">${label}</span>
                          <span class="admin-metric-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor"/></svg></span>
                        </div>
                        <strong class="admin-metric-card__value">${value}</strong>
                        <small>${detail}</small>
                      </article>`,
                  )
                  .join("")}
              </section>
              <section class="admin-panel">
                <header>
                  <div><p class="eyebrow">Paid activity</p><h2>Gross paid revenue over time</h2></div>
                  <div class="admin-chart-toggle" role="group" aria-label="Chart metric">
                    <button aria-pressed="true" type="button">Revenue</button>
                    <button aria-pressed="false" type="button">Purchases</button>
                  </div>
                </header>
                <div class="admin-chart-summary">
                  <span><small>Period total</small><strong>$18,420</strong></span>
                  <span><small>Peak bucket</small><strong>$2,860</strong></span>
                </div>
                <div class="admin-chart-stage">
                  <svg class="admin-overview-chart" viewBox="0 0 1120 300" role="img" aria-label="Revenue trend">
                    <defs><linearGradient id="admin-chart-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".2"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
                    <path class="admin-chart-grid" d="M24 60H1096M24 126H1096M24 192H1096M24 258H1096"/>
                    <path class="admin-chart-area" d="M24 238 L180 214 L335 226 L490 150 L645 175 L800 92 L1096 42 L1096 260 L24 260 Z"/>
                    <path class="admin-chart-line" d="M24 238 L180 214 L335 226 L490 150 L645 175 L800 92 L1096 42"/>
                    <circle class="admin-chart-point" cx="24" cy="238" r="6"/>
                    <circle class="admin-chart-point" cx="490" cy="150" r="6"/>
                    <circle class="admin-chart-point" cx="1096" cy="42" r="6"/>
                    <text class="admin-chart-label" x="24" y="292">Jul 1</text>
                    <text class="admin-chart-label" x="1096" y="292" text-anchor="end">Jul 30</text>
                  </svg>
                </div>
              </section>
              <div class="admin-grid--two">
                <section class="admin-panel">
                  <header><div><p class="eyebrow">Signup cohort</p><h2>Organizer funnel</h2></div></header>
                  <p class="admin-panel__description">Users progressing through the publishing journey.</p>
                  <ol class="admin-funnel">
                    ${[
                      ["Signed up", "148", "100"],
                      ["Created a draft", "104", "70"],
                      ["Started checkout", "73", "49"],
                      ["Paid", "61", "41"],
                      ["Published", "56", "38"],
                    ]
                      .map(
                        ([label, value, width], index) => `
                          <li>
                            <div class="admin-funnel__row">
                              <span><small>0${index + 1}</small><strong>${label}</strong></span>
                              <span><strong>${value}</strong><small>${index ? "82% from previous" : "—"}</small></span>
                            </div>
                            <span class="admin-funnel__track"><span style="width:${width}%"></span></span>
                          </li>`,
                      )
                      .join("")}
                  </ol>
                </section>
                <section class="admin-panel admin-panel--attention">
                  <header><div><p class="eyebrow">Operational attention</p><h2>Warnings</h2></div></header>
                  <ul class="admin-warning-list">
                    <li><span><span class="admin-warning-list__icon">!</span>Payments requiring review</span><strong>3</strong></li>
                    <li><span><span class="admin-warning-list__icon">!</span>Failed photo processing</span><strong>2</strong></li>
                  </ul>
                </section>
              </div>
              <section class="admin-panel admin-panel--table">
                <div class="admin-table-toolbar">
                  <div><strong>Recent customers</strong><span>Newest accounts first</span></div>
                  <span class="admin-section-count">3 results</span>
                </div>
                <div class="admin-table-wrap">
                  <table class="admin-table">
                    <caption>Customer results</caption>
                    <thead><tr><th>User</th><th>Verification</th><th>Signup</th><th>Listings</th><th>Purchases</th><th>Status</th></tr></thead>
                    <tbody>
                      <tr><td data-label="User"><a class="admin-table__primary" href="#">Maria Hernandez</a><br><small>maria@example.com</small></td><td data-label="Verification"><span class="admin-status admin-status--success">Verified</span></td><td data-label="Signup">Jul 29, 2026</td><td data-label="Listings">4 created</td><td data-label="Purchases">3</td><td data-label="Status"><span class="admin-status admin-status--success">Active</span></td></tr>
                      <tr><td data-label="User"><a class="admin-table__primary" href="#">James Wilson</a><br><small>james@example.com</small></td><td data-label="Verification"><span class="admin-status admin-status--warning">Unverified</span></td><td data-label="Signup">Jul 27, 2026</td><td data-label="Listings">1 created</td><td data-label="Purchases">0</td><td data-label="Status"><span class="admin-status">Active</span></td></tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </main>
          <nav class="admin-bottom-nav" aria-label="Mobile admin navigation">
            <a class="admin-nav-link" aria-current="page" href="#">Overview</a>
            <a class="admin-nav-link" href="#">Users</a>
            <a class="admin-nav-link" href="#">Listings</a>
            <a class="admin-nav-link" href="#">Email</a>
            <a class="admin-nav-link" href="#">Imports</a>
          </nav>
        </div>
      </body>
    </html>
  `);
  await page.evaluate(() => document.fonts.ready);
}

test("admin visual system holds at desktop width", async ({
  page,
}, testInfo) => {
  await renderAdminFixture(page, { width: 1440, height: 1000 });

  await expect(page.locator(".admin-sidebar")).toBeVisible();
  await expect(page.locator(".admin-bottom-nav")).toBeHidden();
  await expect(
    page.locator('.admin-sidebar nav[aria-label="Admin navigation"] a'),
  ).toHaveCount(5);
  await expect(page.locator(".admin-metric-card")).toHaveCount(4);
  await expect(page.locator(".admin-table tr").first()).toHaveCSS(
    "display",
    "table-row",
  );

  const columns = await page
    .locator(".admin-metric-card")
    .evaluateAll((cards) =>
      cards.map((card) => Math.round(card.getBoundingClientRect().top)),
    );
  expect(new Set(columns).size).toBe(2);
  const viewportFits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(viewportFits).toBe(true);
  const panelWidth = await page
    .locator(".admin-panel")
    .first()
    .evaluate((panel) => panel.getBoundingClientRect().width);
  expect(panelWidth).toBeGreaterThan(900);

  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("admin-desktop.png"),
  });
});

test("admin visual system is touch-safe on a small phone", async ({
  page,
}, testInfo) => {
  await renderAdminFixture(page, { width: 320, height: 812 });

  await expect(page.locator(".admin-sidebar")).toBeHidden();
  await expect(page.locator(".admin-bottom-nav")).toBeVisible();
  await expect(page.locator(".admin-bottom-nav a")).toHaveCount(5);
  await expect(page.locator(".admin-metric-card")).toHaveCount(4);

  const navTargets = await page
    .locator(".admin-bottom-nav a")
    .evaluateAll((links) =>
      links.map((link) => ({
        width: link.getBoundingClientRect().width,
        height: link.getBoundingClientRect().height,
      })),
    );
  for (const target of navTargets) {
    expect(target.width).toBeGreaterThanOrEqual(48);
    expect(target.height).toBeGreaterThanOrEqual(48);
  }
  const viewportFits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(viewportFits).toBe(true);

  const mobileAccountMenu = page.locator(".admin-topbar .account-menu");
  await mobileAccountMenu.locator("summary").click();
  await expect(
    mobileAccountMenu.locator(".account-menu__popover"),
  ).toBeVisible();
  const menuBounds = await mobileAccountMenu
    .locator(".account-menu__popover")
    .evaluate((menu) => {
      const bounds = menu.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right };
    });
  expect(menuBounds.left).toBeGreaterThanOrEqual(0);
  expect(menuBounds.right).toBeLessThanOrEqual(320);
  await mobileAccountMenu.locator("summary").click();

  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("admin-mobile.png"),
  });
});

test("admin directories become readable cards before the sidebar crowds them", async ({
  page,
}, testInfo) => {
  await renderAdminFixture(page, { width: 1024, height: 900 });

  await expect(page.locator(".admin-sidebar")).toBeVisible();
  await expect(page.locator(".admin-table tr").first()).toHaveCSS(
    "display",
    "block",
  );
  const viewportFits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(viewportFits).toBe(true);

  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("admin-adaptive-directory.png"),
  });
});

test("admin interactions respect reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await renderAdminFixture(page, { width: 1024, height: 768 });

  const duration = await page
    .locator(".admin-metric-card")
    .first()
    .evaluate((card) => getComputedStyle(card).transitionDuration);
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.001);
});
