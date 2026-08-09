import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

async function pageStyles(): Promise<string> {
  const [globalCss, foundationCss, marketplaceCss] = await Promise.all([
    readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8"),
    readFile(path.join(process.cwd(), "src/app/foundation.css"), "utf8"),
    readFile(path.join(process.cwd(), "src/app/marketplace.css"), "utf8"),
  ]);
  return `${globalCss}\n${foundationCss}\n${marketplaceCss}\n
    :root { --font-manrope: Arial; }
    .visual-icon {
      display: block;
      width: 1.15rem;
      height: 1.15rem;
      border: 2px solid currentColor;
      border-radius: 0.35rem;
    }
  `;
}

async function dataImage(relativePath: string): Promise<string> {
  const image = await readFile(path.join(process.cwd(), relativePath));
  return `data:image/webp;base64,${image.toString("base64")}`;
}

async function renderExternalListing(page: Page, width: number) {
  const [styles, logo, placeholder] = await Promise.all([
    pageStyles(),
    dataImage("public/images/Logo-gold-black-01.webp"),
    dataImage("public/images/marketplace-hero.webp"),
  ]);
  await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
  await page.setContent(`<!doctype html>
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>${styles}</style>
      </head>
      <body>
        <div class="public-shell">
          <a class="skip-link" href="#main-content">Skip to main content</a>
          <header class="public-header">
            <div class="shell-container public-header__inner">
              <a class="brand" href="#" aria-label="Estate Sales Bakersfield home">
                <picture class="brand__logo">
                  <img alt="" aria-hidden="true" class="brand__logo-image" height="340" src="${logo}" width="2000">
                </picture>
              </a>
              <nav class="public-nav public-nav--desktop" aria-label="Primary">
                <a class="ui-text-link" href="#">Find sales</a>
                <a class="ui-text-link" href="#">How it works</a>
                <a class="ui-text-link" href="#">About</a>
                <a class="ui-text-link" href="#">FAQs</a>
              </nav>
              <div class="public-header__actions">
                <a class="ui-button ui-button--accent public-listing-cta" href="#">List your sale</a>
                <a class="ui-text-link public-login public-login--button" href="#">Log in</a>
              </div>
              <div class="public-header__mobile-actions">
                <a class="ui-text-link public-login public-login--button" href="#">Log in</a>
                <details class="public-menu"><summary aria-label="Open navigation"><span class="visual-icon"></span></summary></details>
              </div>
            </div>
          </header>
          <main id="main-content">
            <div class="preview-shell public-listing-page">
              <nav class="listing-breadcrumb" aria-label="Breadcrumb">
                <a href="#">Bakersfield, CA</a><span aria-hidden="true">/</span>
                <a href="#">Estate sales</a><span aria-hidden="true">/</span>
                <span>Vintage Bakersfield Estate Sale</span>
              </nav>
              <article class="public-listing" data-source-kind="EXTERNAL">
                <header class="public-listing-hero">
                  <div class="public-listing-hero__glow" aria-hidden="true"></div>
                  <div class="public-listing-hero__panel">
                    <p class="public-listing-hero__eyebrow">Estate sale <span aria-hidden="true">&bull;</span> Bakersfield, CA</p>
                    <h1>Vintage Bakersfield Estate Sale</h1>
                    <div class="public-listing-facts">
                      <div><span aria-hidden="true"><i class="visual-icon"></i></span><p><strong>Saturday, September 12, 2026 at 9:00 AM</strong><span>Sunday, September 13, 2026 at 3:00 PM</span></p></div>
                      <div><span aria-hidden="true"><i class="visual-icon"></i></span><p><strong>Near Bakersfield, CA</strong><span>Exact address is private</span></p></div>
                      <div><span aria-hidden="true"><i class="visual-icon"></i></span><p><strong>Unclaimed / External listing</strong><span>Source: EstateSales.org</span><a href="#">View original listing</a></p></div>
                    </div>
                    <div class="public-listing-actions"><a href="#">Get directions</a><button type="button">Share</button></div>
                  </div>
                </header>
                <div class="public-listing-content">
                  <div class="public-listing-external-placeholder" aria-label="External listing image placeholder" data-external-listing-placeholder="true">
                    <img src="${placeholder}" alt="Marketplace placeholder for Vintage Bakersfield Estate Sale">
                  </div>
                  <section class="public-listing-about" aria-labelledby="about-sale-title">
                    <h2 id="about-sale-title">About this sale</h2>
                    <p>Furniture, books, artwork, and household goods from a carefully maintained Bakersfield home.</p>
                  </section>
                  <section class="public-listing-trust" aria-label="Listing highlights">
                    <div><i class="visual-icon" aria-hidden="true"></i><p><strong>Source transparency</strong><span>Original listing clearly identified</span></p></div>
                    <div><i class="visual-icon" aria-hidden="true"></i><p><strong>Exact timing</strong><span>Server-validated sale hours</span></p></div>
                    <div><i class="visual-icon" aria-hidden="true"></i><p><strong>Local listing</strong><span>Focused on Bakersfield</span></p></div>
                    <div><i class="visual-icon" aria-hidden="true"></i><p><strong>Privacy aware</strong><span>Location details provided for this event</span></p></div>
                  </section>
                  <p class="publication-proof">External listing attributed to EstateSales.org. Estate Sales Bakersfield is not the organizer.</p>
                </div>
              </article>
            </div>
          </main>
        </div>
      </body>
    </html>`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map(
        (image) =>
          image.complete ||
          new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
      ),
    );
  });
}

for (const width of [390, 1280] as const) {
  test(`external listing detail is stable at ${String(width)}px`, async ({
    page,
  }, testInfo) => {
    await renderExternalListing(page, width);

    const listing = page.locator(
      'article.public-listing[data-source-kind="EXTERNAL"]',
    );
    await expect(listing).toBeVisible();
    await expect(
      listing.getByRole("heading", {
        name: "Vintage Bakersfield Estate Sale",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      listing.getByText("Unclaimed / External listing", { exact: true }),
    ).toBeVisible();
    await expect(
      listing.locator('[data-external-listing-placeholder="true"] img'),
    ).toHaveCSS("object-fit", "cover");
    await expect(listing.locator(".public-listing-detail-tabs")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.screenshot({
      fullPage: true,
      animations: "disabled",
      path: testInfo.outputPath(`external-listing-detail-${String(width)}.png`),
    });
  });
}
