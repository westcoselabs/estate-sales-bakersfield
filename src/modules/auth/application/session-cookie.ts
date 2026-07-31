export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SUPER_ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const RECENT_PASSWORD_TTL_MS = 15 * 60 * 1000;

export interface SessionCookieOptions {
  readonly expires: Date;
  readonly httpOnly: true;
  readonly maxAge?: number;
  readonly path: "/";
  readonly sameSite: "lax";
  readonly secure: boolean;
}

export function getSessionCookieName(isProduction: boolean): string {
  return isProduction ? "__Host-estate_session" : "estate_session";
}

export function getSessionCookieOptions(
  expiresAt: Date,
  isProduction: boolean,
): SessionCookieOptions {
  return {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isProduction,
  };
}

export function getExpiredSessionCookieOptions(
  isProduction: boolean,
): SessionCookieOptions {
  return {
    ...getSessionCookieOptions(new Date(0), isProduction),
    maxAge: 0,
  };
}
