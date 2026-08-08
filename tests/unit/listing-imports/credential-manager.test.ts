import { readFile } from "node:fs/promises";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { CredentialManager } from "@/app/admin/imports/_components/credential-manager";

describe("CredentialManager", () => {
  it("renders only bounded credential metadata and available actions", () => {
    const html = renderToStaticMarkup(
      createElement(CredentialManager, {
        sources: [
          {
            id: "50000000-0000-4000-8000-000000000001",
            key: "fixture",
            name: "Fixture source",
          },
        ],
        credentials: [
          {
            id: "40000000-0000-4000-8000-000000000001",
            name: "Local importer",
            sourceKey: "fixture",
            sourceName: "Fixture source",
            displayPrefix: "esb_ing_AAAAAAAA",
            createdAt: "2026-08-04T20:00:00.000Z",
            lastUsedAt: null,
            revokedAt: null,
          },
          {
            id: "40000000-0000-4000-8000-000000000002",
            name: "Retired importer",
            sourceKey: "fixture",
            sourceName: "Fixture source",
            displayPrefix: "esb_ing_BBBBBBBB",
            createdAt: "2026-08-03T20:00:00.000Z",
            lastUsedAt: "2026-08-04T19:00:00.000Z",
            revokedAt: "2026-08-04T21:00:00.000Z",
          },
        ],
      }),
    );

    expect(html).toContain("Local importer");
    expect(html).toContain("Retired importer");
    expect(html).toContain("Fixture source");
    expect(html).toContain("esb_ing_AAAAAAAA");
    expect(html).toContain("Create credential");
    expect(html).toContain("Revoke credential Local importer");
    expect(html).toContain("Revoked");
    expect(html).not.toContain(`esb_ing_${"Z".repeat(43)}`);
    expect(html).not.toContain("tokenDigest");
  });

  it("keeps the one-time token flow in memory and uses the guarded APIs", async () => {
    const source = await readFile(
      path.resolve("src/app/admin/imports/_components/credential-manager.tsx"),
      "utf8",
    );

    expect(source).toContain("useState<CreatedCredentialToken | null>(null)");
    expect(source).toContain('fetch("/api/admin/reauth"');
    expect(source).toContain('fetch("/api/admin/imports/credentials"');
    expect(source).toContain(
      "/api/admin/imports/credentials/${selectedCredential.id}/revoke",
    );
    expect(source).not.toMatch(
      /localStorage|sessionStorage|console\.|URLSearchParams/u,
    );
  });
});
