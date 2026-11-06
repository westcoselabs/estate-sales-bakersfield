import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

const output = path.resolve(".tmp/campaign-send-browser");
await mkdir(output, { recursive: true });
const component = path
  .resolve("src/app/admin/email/campaigns/[campaignId]/campaign-actions.tsx")
  .replaceAll("\\", "/");
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CampaignActions} from ${JSON.stringify(component)};
const root=createRoot(document.getElementById('app'));
window.refreshCampaign=async()=>{const state=await (await fetch('/state')).json();root.render(React.createElement(CampaignActions,{...state,key:state.campaign.version}));};
window.refreshCampaign();`;
const bundle = await build({
  stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd() },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  plugins: [
    {
      name: "navigation-fixture",
      setup(build) {
        build.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: "navigation",
          namespace: "fixture",
        }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents:
            "export function useRouter(){return {refresh:()=>window.refreshCampaign()}}",
        }));
      },
    },
  ],
});
const css = await readFile("src/app/foundation.css", "utf8");
const campaign = {
  id: "fixture",
  name: "Simply Decorated",
  subject: "Explore 148 photos",
  previewText: "Find your next favorite",
  status: "DRAFT",
  version: 6,
  testedAt: null as string | null,
  draftHtml: "<h1>Explore the sale</h1>",
  contactCategory: "ATTENDEE",
  contactSourceTag: "Simply Decorated",
};
const audience = {
  category: "ATTENDEE",
  sourceTag: "Simply Decorated",
  eligible: 125,
  suppressed: 33,
  total: 158,
};
let sends = 0;
let submitted: unknown;
const server = createServer(async (request, response) => {
  if (request.url === "/") {
    response.setHeader("content-type", "text/html");
    response.end(
      `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--font-manrope:Arial;--font-sans:Arial}body{font-family:Arial,sans-serif}${css}</style></head><body><main class="admin-page" style="max-width:1100px;margin:auto;padding:24px"><div id="app"></div></main><script src="/app.js"></script></body></html>`,
    );
    return;
  }
  if (request.url === "/app.js") {
    response.setHeader("content-type", "text/javascript");
    response.end(bundle.outputFiles[0]!.text);
    return;
  }
  response.setHeader("content-type", "application/json");
  if (request.url === "/state") {
    response.end(
      JSON.stringify({
        campaign,
        contactAudiences: [audience],
        audience,
        dispatchEnabled: true,
        lastErrorCode: null,
      }),
    );
    return;
  }
  let body = "";
  for await (const chunk of request) body += chunk;
  const input = body ? JSON.parse(body) : {};
  if (request.url === "/api/admin/reauth") {
    response.statusCode = input.password === "correct" ? 200 : 401;
    response.end("{}");
    return;
  }
  if (request.url?.endsWith("/test")) {
    campaign.testedAt = new Date().toISOString();
    response.end("{}");
    return;
  }
  if (request.url?.endsWith("/send")) {
    sends++;
    submitted = input;
    await new Promise((resolve) => setTimeout(resolve, 350));
    campaign.status = "PREPARING";
    campaign.version++;
    response.end(JSON.stringify({ recipientCount: 125 }));
    return;
  }
  response.statusCode = 404;
  response.end("{}");
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("Server address unavailable");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}`);
  await expect(
    page.getByRole("button", { name: "Review and send", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Send owner test" }).click();
  await expect(
    page.getByRole("button", { name: "Review and send", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Subject", { exact: true }).fill("Unsaved edit");
  await expect(
    page.getByRole("button", { name: "Review and send", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Subject", { exact: true }).fill(campaign.subject);
  await page
    .getByRole("button", { name: "Review and send", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Send campaign", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Admin password").fill("incorrect");
  await page.getByLabel("Type SEND").fill("SEND");
  await page
    .getByRole("button", { name: "Send campaign", exact: true })
    .click();
  await expect(
    page.getByText("Password confirmation failed. Please try again."),
  ).toBeVisible();
  expect(sends).toBe(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Type SEND")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review and send", exact: true })
    .click();
  await page.getByLabel("Admin password").fill("correct");
  await page.getByLabel("Type SEND").fill("SEND");
  await page.screenshot({
    path: path.join(output, "review-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: path.join(output, "review-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Send campaign", exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(
    page.getByText("Campaign is preparing.", { exact: true }),
  ).toBeVisible();
  expect(sends).toBe(1);
  expect(submitted).toEqual({ expectedVersion: 6, confirmation: "SEND" });
  expect(errors).toEqual([]);
  await writeFile(
    path.join(output, "result.json"),
    JSON.stringify({ passed: true, sends, submitted, errors }),
  );
  console.log(
    "Campaign browser checks passed: test gate, unsaved edits, password failure, cancel, mobile layout, single dispatch and queued state.",
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
