import { describe, expect, it } from "vitest";

import { createNeonAdapter } from "@/platform/database/neon-adapter";

const baseUrl =
  "postgresql://development_user:secret@example.neon.tech/neondb?sslmode=require";

describe("Neon adapter schema selection", () => {
  it("allows only generated test schemas", () => {
    expect(() => createNeonAdapter(baseUrl)).not.toThrow();
    expect(() =>
      createNeonAdapter(
        `${baseUrl}&schema=codex_test_1785888000000_0123456789ab`,
      ),
    ).not.toThrow();
    expect(() => createNeonAdapter(`${baseUrl}&schema=public`)).toThrow(
      /restricted to test schemas/,
    );
    expect(() => createNeonAdapter(`${baseUrl}&schema=tenant_one`)).toThrow(
      /restricted to test schemas/,
    );
  });
});
