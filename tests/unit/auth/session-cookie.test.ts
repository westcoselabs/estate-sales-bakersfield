import { describe, expect, it } from "vitest";

import {
  getExpiredSessionCookieOptions,
  getSessionCookieName,
  getSessionCookieOptions,
} from "@/modules/auth/application/session-cookie";

describe("session cookie policy", () => {
  it("uses a host-only secure production cookie", () => {
    const expires = new Date("2026-07-23T12:00:00.000Z");
    const options = getSessionCookieOptions(expires, true);

    expect(getSessionCookieName(true)).toBe("__Host-estate_session");
    expect(options).toEqual({
      expires,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
    expect(options).not.toHaveProperty("domain");
  });

  it("expires the same host-only cookie immediately on logout", () => {
    expect(getExpiredSessionCookieOptions(true)).toMatchObject({
      expires: new Date(0),
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });
});
