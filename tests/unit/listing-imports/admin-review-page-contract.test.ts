import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const pageFiles = {
  landing: "src/app/admin/imports/page.tsx",
  manual: "src/app/admin/imports/new/page.tsx",
  batch: "src/app/admin/imports/batches/[batchId]/page.tsx",
  candidate: "src/app/admin/imports/candidates/[candidateId]/page.tsx",
  listing: "src/app/admin/imports/listings/[listingId]/page.tsx",
} as const;

const routeFiles = [
  "src/app/api/admin/imports/candidates/[candidateId]/route.ts",
  "src/app/api/admin/imports/candidates/[candidateId]/approve/route.ts",
  "src/app/api/admin/imports/candidates/[candidateId]/reject/route.ts",
  "src/app/api/admin/imports/candidates/[candidateId]/delete/route.ts",
  "src/app/api/admin/imports/candidates/[candidateId]/location/route.ts",
  "src/app/api/admin/imports/candidates/[candidateId]/duplicates/recompute/route.ts",
  "src/app/api/admin/imports/candidates/[candidateId]/duplicates/[matchId]/resolve/route.ts",
  "src/app/api/admin/imports/listings/[listingId]/route.ts",
  "src/app/api/admin/imports/listings/[listingId]/remove/route.ts",
] as const;

function source(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function filesUnder(directory: string): string[] {
  return readdirSync(resolve(directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory() ? filesUnder(path) : [path];
    },
  );
}

describe("listing import Phase 4 admin page and route contract", () => {
  it("wires exactly the five landing, manual-import, and detail page surfaces", () => {
    const actualPages = filesUnder("src/app/admin/imports")
      .filter((path) => path.endsWith("/page.tsx"))
      .sort();
    expect(actualPages).toEqual(Object.values(pageFiles).sort());

    const landing = source(pageFiles.landing);
    expect(landing).toContain("listingImportAdminLandingCriteria");
    expect(landing).toContain(".landing(");
    expect(landing).toContain('case "candidates"');
    expect(landing).toContain('case "batches"');
    expect(landing).toContain('case "listings"');
    expect(landing).toContain('view === "credentials"');
    expect(landing).toContain('href="/admin/imports/new"');

    const manual = source(pageFiles.manual);
    expect(manual).toContain("<ManualImportForm");
    expect(manual).toContain('href="/admin/imports"');

    const batch = source(pageFiles.batch);
    expect(batch).toContain(".batchDetail(");
    expect(batch).toMatch(
      /z\s*\.\s*string\(\)\s*\.\s*uuid\(\)\s*\.\s*safeParse/u,
    );
    expect(batch).toContain(
      "Input payloads and private addresses are not exposed",
    );

    const candidate = source(pageFiles.candidate);
    expect(candidate).toContain(".candidateDetail(");
    expect(candidate).toContain("<CandidateEditor");
    expect(candidate).toContain("<DuplicateReview");
    expect(candidate).toContain("<CandidateActions");
    expect(candidate).toContain("Provenance and location");
    expect(candidate).toContain("Audit timeline");

    const listing = source(pageFiles.listing);
    expect(listing).toContain(".externalListingDetail(");
    expect(listing).toContain("<ExternalListingEditor");
    expect(listing).toContain("<ExternalListingActions");
    expect(listing).toContain("Publication and provenance");
    expect(listing).toContain("Confirmed location");
    expect(listing).toContain("Audit timeline");
  });

  it("keeps all nine candidate/listing mutations behind the shared bounded route contract", () => {
    expect(routeFiles).toHaveLength(9);
    for (const path of routeFiles) {
      const route = source(path);
      expect(route).toContain('export const dynamic = "force-dynamic"');
      expect(route).toContain('export const runtime = "nodejs"');
      expect(route).toMatch(/export async function (?:POST|PUT)\(/u);
      expect(route).toMatch(
        /z\s*\.\s*string\(\)\s*\.\s*uuid\(\)\s*\.\s*parse/u,
      );
      expect(route).toContain("authorizeListingImportReview(request,");
      expect(route).toContain("await readAdminBoundedJson(request)");
      expect(route).toContain("return adminApiError(");
    }

    const authorization = source("src/app/api/admin/imports/_review-route.ts");
    expect(authorization).toContain("assertAdminOrigin(request)");
    expect(authorization).toContain("await getCurrentSession()");
    expect(authorization).toContain("authorizeAdminService(");
    expect(authorization).toContain("await enforceAdminRateLimit(");
    expect(authorization.indexOf("assertAdminOrigin(request)")).toBeLessThan(
      authorization.indexOf("await getCurrentSession()"),
    );

    const errors = source("src/app/api/admin/_shared.ts");
    expect(errors).toContain("error instanceof ListingImportReviewError");
    expect(errors).toContain("status = error.status");
    expect(errors).toContain("code = error.code");
  });

  it("shares unsaved candidate state across every persisted review action", () => {
    const candidatePage = source(pageFiles.candidate);
    const editor = source(
      "src/app/admin/imports/_components/candidate-editor.tsx",
    );
    const actions = source(
      "src/app/admin/imports/_components/candidate-actions.tsx",
    );
    const duplicates = source(
      "src/app/admin/imports/_components/duplicate-review.tsx",
    );
    const state = source(
      "src/app/admin/imports/_components/candidate-review-state.tsx",
    );

    expect(candidatePage).toContain("<CandidateReviewStateProvider");
    expect(candidatePage).toContain("candidate.id}:${candidate.version}");
    expect(state).toContain(
      "Save or discard your changes before continuing review.",
    );
    expect(editor).toContain("formRef.current?.reset()");
    expect(editor).toContain("headingRef.current?.focus()");
    expect(editor).toContain("Discard changes");
    expect(editor).toContain("pending !== null || !dirty");
    expect(editor).toContain("pending !== null || dirty");
    expect(actions).toContain("pending || dirty");
    expect(actions).toContain("if (dirty) return");
    expect(duplicates).toContain("pending || dirty");
    expect(duplicates).toContain("if (dirty) return");
    expect(duplicates).toContain("duplicate.recheckOnly");
  });

  it("does not add Phase 5 cover/public-search work or organizer/payment mutations", () => {
    const implementation = [
      ...Object.values(pageFiles),
      ...routeFiles,
      "src/app/api/admin/imports/_review-route.ts",
    ]
      .map(source)
      .join("\n");
    expect(implementation).not.toMatch(
      /from ["']@\/modules\/(?:events|payments|public-search)/u,
    );
    expect(implementation).not.toMatch(
      /createConfigured(?:Event|Payment|PublicSearch)/u,
    );
    expect(implementation).not.toMatch(
      /\.(?:createEvent|updateEvent|publishEvent|createCheckout)\s*\(/u,
    );

    const adminApiFiles = filesUnder("src/app/api/admin/imports");
    expect(
      adminApiFiles.filter((path) => /(?:^|\/)cover(?:\/|$)/u.test(path)),
    ).toEqual([]);
  });
});
