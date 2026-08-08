import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

async function styles(): Promise<string> {
  const [globalCss, foundationCss] = await Promise.all([
    readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8"),
    readFile(path.join(process.cwd(), "src/app/foundation.css"), "utf8"),
  ]);
  return `${globalCss}\n${foundationCss}\n:root { --font-manrope: Arial; }`;
}

function shell(content: string): string {
  return `
    <div class="admin-app">
      <a class="skip-link" href="#main-content">Skip to main content</a>
      <aside class="admin-sidebar">
        <div class="admin-sidebar__brand">
          <a class="brand" href="#"><strong>ESTATE SALES BAKERSFIELD</strong></a>
          <span>Owner control center</span>
        </div>
        <div class="admin-sidebar__identity">
          <span class="admin-sidebar__identity-icon" aria-hidden="true"></span>
          <span><small>Secure session</small><strong>Super administrator</strong></span>
        </div>
        <div class="admin-sidebar__navigation">
          <span class="admin-sidebar__label">Workspace</span>
          <nav aria-label="Admin navigation">
            <a class="admin-nav-link" href="#">Overview</a>
            <a class="admin-nav-link" href="#">Users</a>
            <a class="admin-nav-link" href="#">Listings</a>
            <a class="admin-nav-link" href="#">Email</a>
            <a class="admin-nav-link" aria-current="page" href="#">Imports</a>
          </nav>
        </div>
      </aside>
      <header class="admin-topbar"><strong>ESB</strong><span>Owner portal</span></header>
      <main class="admin-main" id="main-content">${content}</main>
      <nav class="admin-bottom-nav" aria-label="Mobile admin navigation">
        <a class="admin-nav-link" href="#">Overview</a>
        <a class="admin-nav-link" href="#">Users</a>
        <a class="admin-nav-link" href="#">Listings</a>
        <a class="admin-nav-link" href="#">Email</a>
        <a class="admin-nav-link" aria-current="page" href="#">Imports</a>
      </nav>
    </div>`;
}

async function render(
  page: Page,
  content: string,
  viewport: { readonly width: number; readonly height: number },
) {
  await page.setViewportSize(viewport);
  await page.setContent(`<!doctype html>
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>${await styles()}</style>
      </head>
      <body>${shell(content)}</body>
    </html>`);
  await page.evaluate(() => document.fonts.ready);
}

const tabs = `
  <nav class="admin-import-tabs" aria-label="Listing import views">
    <a aria-current="page" href="#"><span>Pending candidates</span><strong>2</strong></a>
    <a href="#"><span>Batch history</span><strong>8</strong></a>
    <a href="#"><span>Published listings</span><strong>3</strong></a>
    <a href="#"><span>Credentials</span><strong>1</strong></a>
  </nav>`;

const landing = `
  <div class="admin-page">
    <header class="admin-page-header">
      <div>
        <p class="eyebrow">Review before publication</p>
        <h1>Listing Imports</h1>
        <p>Inspect source observations, resolve possible duplicates, and publish external listings without creating organizer or payment records.</p>
      </div>
      <a class="ui-button ui-button--primary" href="#">New manual import</a>
    </header>
    ${tabs}
    <section class="admin-panel admin-panel--table">
      <div class="admin-table-toolbar">
        <div><strong>Pending candidates</strong><span>Newest records first</span></div>
        <span class="admin-section-count">2 on this page</span>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <caption>Pending imported listing candidates</caption>
          <thead><tr><th>Candidate</th><th>Source</th><th>Schedule</th><th>Location</th><th>Duplicates</th><th>Imported</th><th>Status</th></tr></thead>
          <tbody>
            <tr>
              <td data-label="Candidate"><a class="admin-table__primary" href="#">Vintage Bakersfield Estate Sale</a><br><small>Version 3</small></td>
              <td data-label="Source">EstateSales.org<br><small>estatesales-org</small></td>
              <td data-label="Schedule">Sep 12, 2026, 9:00 AM<br><small>through Sep 13, 2026, 3:00 PM</small></td>
              <td data-label="Location">Bakersfield, CA 93301</td>
              <td data-label="Duplicates"><span class="admin-status admin-status--warning">1 unresolved</span></td>
              <td data-label="Imported">Aug 7, 2026, 9:10 AM</td>
              <td data-label="Status"><span class="admin-status admin-status--warning">pending review</span></td>
            </tr>
            <tr>
              <td data-label="Candidate"><a class="admin-table__primary" href="#">Westchester Downsizing Sale</a><br><small>Version 1</small></td>
              <td data-label="Source">EstateSales.org<br><small>estatesales-org</small></td>
              <td data-label="Schedule">Sep 19, 2026, 8:00 AM<br><small>through Sep 19, 2026, 2:00 PM</small></td>
              <td data-label="Location">Bakersfield, CA 93301</td>
              <td data-label="Duplicates">None unresolved</td>
              <td data-label="Imported">Aug 7, 2026, 8:42 AM</td>
              <td data-label="Status"><span class="admin-status admin-status--warning">pending review</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>`;

const candidateDetail = `
  <div class="admin-page">
    <header class="admin-page-header">
      <div>
        <p class="eyebrow">EstateSales.org candidate</p>
        <h1>Vintage Bakersfield Estate Sale</h1>
        <p>Imported Aug 7, 2026, 9:10 AM · version 3</p>
      </div>
      <span class="admin-status admin-status--warning">pending review</span>
    </header>
    <div class="admin-actions"><a class="ui-button ui-button--secondary" href="#">Back to candidates</a></div>
    <form class="admin-panel admin-review-form">
      <header><div><p class="eyebrow">Public-facing draft</p><h2>Edit candidate</h2></div><span class="admin-status admin-status--success">Location confirmed</span></header>
      <div class="admin-review-form__grid">
        <label class="ui-field"><span class="ui-field__label">Sale type</span><select class="ui-input"><option>Estate sale</option></select></label>
        <label class="ui-field admin-review-form__wide"><span class="ui-field__label">Title</span><input class="ui-input" value="Vintage Bakersfield Estate Sale"></label>
        <label class="ui-field admin-review-form__wide"><span class="ui-field__label">Description</span><textarea class="ui-input">Furniture, books, artwork, and household goods from a carefully maintained home.</textarea></label>
        <label class="ui-field"><span class="ui-field__label">Starts</span><input class="ui-input" value="2026-09-12T09:00"></label>
        <label class="ui-field"><span class="ui-field__label">Ends</span><input class="ui-input" value="2026-09-13T15:00"></label>
        <label class="ui-field"><span class="ui-field__label">Timezone</span><input class="ui-input" value="America/Los_Angeles"></label>
        <label class="ui-field"><span class="ui-field__label">Public address</span><select class="ui-input"><option>Approximate location</option></select></label>
        <label class="ui-field admin-review-form__wide"><span class="ui-field__label">Address line 1</span><input class="ui-input" value="101 Example Avenue"></label>
        <label class="ui-field"><span class="ui-field__label">City</span><input class="ui-input" value="Bakersfield"></label>
        <label class="ui-field"><span class="ui-field__label">Postal code</span><input class="ui-input" value="93301"></label>
      </div>
      <p class="ui-alert ui-alert--warning">Imported addresses remain approximate unless you explicitly choose exact address.</p>
      <div class="admin-actions"><button class="ui-button ui-button--primary">Save changes</button><button class="ui-button ui-button--secondary">Confirm saved location</button></div>
    </form>
    <section class="admin-panel" aria-labelledby="duplicate-review-title">
      <header><div><p class="eyebrow">Human decisions only</p><h2 id="duplicate-review-title">Probable duplicates</h2></div><span class="admin-section-count">1</span></header>
      <ul class="admin-duplicate-list">
        <li><div><span class="admin-duplicate-list__kind">Organizer listing</span><a href="#">Vintage Bakersfield Estate Sale</a><small>full address schedule overlap · title postal date similarity</small></div><span class="admin-status admin-status--warning">unresolved</span><div class="admin-actions"><button class="ui-button ui-button--secondary">Not a duplicate</button><button class="ui-button ui-button--primary">Link existing</button></div></li>
      </ul>
    </section>
    <section class="admin-panel">
      <header><h2>Review decision</h2></header>
      <p>Approval revalidates the candidate, confirmed location, and duplicate state before creating a separate external listing.</p>
      <div class="admin-actions"><button class="ui-button ui-button--primary" disabled>Approve listing</button><button class="ui-button ui-button--secondary">Refresh duplicates</button><button class="ui-button ui-button--secondary">Reject</button><button class="ui-button ui-button--danger">Delete candidate</button></div>
      <p class="ui-alert ui-alert--warning">Resolve every current duplicate warning before approval.</p>
    </section>
  </div>`;

for (const width of [390, 1440] as const) {
  test(`Listing Imports landing is stable at ${width}px`, async ({
    page,
  }, testInfo) => {
    await render(page, landing, { width, height: 1000 });

    await expect(
      page.getByRole("heading", { name: "Listing Imports" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Listing import views" })
        .getByRole("link"),
    ).toHaveCount(4);
    if (width < 768) {
      await expect(page.locator(".admin-sidebar")).toBeHidden();
      await expect(
        page.getByRole("navigation", { name: "Mobile admin navigation" }),
      ).toBeVisible();
      await expect(page.locator(".admin-table tbody tr").first()).toHaveCSS(
        "display",
        "block",
      );
    } else {
      await expect(page.locator(".admin-sidebar")).toBeVisible();
      await expect(page.locator(".admin-bottom-nav")).toBeHidden();
      await expect(page.locator(".admin-table tbody tr").first()).toHaveCSS(
        "display",
        "table-row",
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`listing-imports-landing-${width}.png`),
    });
  });
}

for (const width of [390, 1024] as const) {
  test(`Listing Imports candidate review is unclipped at ${width}px`, async ({
    page,
  }, testInfo) => {
    await render(page, candidateDetail, { width, height: 1100 });

    await expect(
      page.getByRole("heading", { name: "Edit candidate" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Probable duplicates" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve listing" }),
    ).toBeDisabled();
    await expect(
      page
        .getByRole("navigation", {
          name: width < 768 ? "Mobile admin navigation" : "Admin navigation",
        })
        .getByRole("link"),
    ).toHaveCount(5);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath(`listing-imports-candidate-${width}.png`),
    });
  });
}
