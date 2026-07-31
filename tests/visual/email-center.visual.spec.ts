import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

const widths = [375, 768, 1024, 1440] as const;

for (const width of widths) {
  test(`email editor is unclipped at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 980 });
    const css = await readFile(
      path.join(process.cwd(), "src/app/foundation.css"),
      "utf8",
    );
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--font-manrope:Arial}*{box-sizing:border-box}body{margin:0}${css}</style></head><body>
      <div class="admin-app">
        <aside class="admin-sidebar"><div class="admin-sidebar__brand"><strong>ESTATE SALES BAKERSFIELD</strong><span>Owner control center</span></div><div class="admin-sidebar__identity"><span><small>Secure session</small><strong>Super administrator</strong></span></div><nav aria-label="Admin navigation"><a class="admin-nav-link">Overview</a><a class="admin-nav-link">Users</a><a class="admin-nav-link">Listings</a><a class="admin-nav-link" aria-current="page">Email</a></nav></aside>
        <header class="admin-topbar"><strong>ESB</strong><span>Owner portal</span></header>
        <main class="admin-main"><div class="admin-page admin-page--wide"><header class="admin-page-header"><div><p class="eyebrow">Email center / Templates</p><h1>Recent listings</h1><p>Protected system template · Draft version 4</p></div></header>
          <div class="email-editor-shell"><section class="admin-panel email-editor-toolbar"><label class="ui-field"><span class="ui-field__label">Subject</span><input class="ui-input" value="Recently listed estate sales in Bakersfield"></label><div class="email-editor-toolbar__actions"><button class="ui-button ui-button--secondary">Upload HTML</button><button class="ui-button ui-button--secondary">Save draft</button><button class="ui-button ui-button--secondary">Send test</button></div><p class="email-save-state">Draft autosaved</p></section>
          <div class="email-editor-tabs" role="tablist"><button role="tab" aria-selected="true">Code</button><button role="tab" aria-selected="false">Preview</button></div>
          <section class="email-editor-grid"><div class="admin-panel email-code-pane"><div class="email-pane-heading"><div><strong>HTML</strong><small>Sanitized email-safe source</small></div><span>4,219 bytes</span></div><pre style="height:620px;margin:0;padding:20px;overflow:auto;background:#fbfbfb;color:#173a2d">&lt;html&gt;\n  &lt;body&gt;\n    &lt;h1&gt;Fresh finds near Bakersfield&lt;/h1&gt;\n    {{{RECENT_LISTINGS_HTML}}}\n  &lt;/body&gt;\n&lt;/html&gt;</pre></div><div class="admin-panel email-preview-pane email-pane--mobile-hidden"><div class="email-pane-heading"><div><strong>Preview</strong><small>External images blocked</small></div><div class="email-preview-toggle"><button aria-pressed="true">Desktop</button><button aria-pressed="false">Mobile</button></div></div><div class="email-iframe-wrap"><div style="max-width:600px;margin:auto;background:#fffdf8;border:1px solid #ded7c7"><div style="padding:24px 40px;background:#173a2d;color:#fff">ESTATE SALES <span style="color:#e8d596">BAKERSFIELD</span></div><div style="padding:40px"><h2 style="font:36px Georgia;color:#173a2d">Fresh finds near Bakersfield</h2><p>These recently published sales are ready to explore.</p><div style="padding:18px;border:1px solid #ded7c7;border-radius:12px"><strong>Vintage Home Estate Sale</strong><br>Bakersfield</div></div></div></div></div></section>
          <section class="email-publish-grid"><div class="admin-panel email-publish-card"><p class="eyebrow">Publish control</p><h2>Live revision 3</h2><p>Test this exact draft before publishing.</p><button class="ui-button ui-button--primary">Publish revision</button></div><div class="admin-panel email-revision-card"><p class="eyebrow">Immutable history</p><h2>Published revisions</h2><ul><li><span><strong>Revision 3</strong><small>Today</small></span><button>Restore</button></li></ul></div></section></div>
        </div></main><nav class="admin-bottom-nav" aria-label="Mobile admin navigation"><a class="admin-nav-link">Overview</a><a class="admin-nav-link">Users</a><a class="admin-nav-link">Listings</a><a class="admin-nav-link" aria-current="page">Email</a></nav>
      </div></body></html>`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (width < 768) {
      await expect(page.getByRole("tab", { name: "Code" })).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Mobile admin navigation" }),
      ).toBeVisible();
    }
    await page.screenshot({
      fullPage: true,
      path: path.join(process.cwd(), ".tmp", `email-center-${width}.png`),
    });
  });
}
