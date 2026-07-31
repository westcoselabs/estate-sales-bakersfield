import "server-only";

import { cookies } from "next/headers";

import {
  requireSuperAdminPrincipal,
  requireVerifiedPublishingPrincipal,
  requireUserPrincipal,
} from "../application/guards";
import {
  getExpiredSessionCookieOptions,
  getSessionCookieName,
  getSessionCookieOptions,
} from "../application/session-cookie";
import type {
  AuthPrincipal,
  CurrentSession,
  SessionGrant,
} from "../domain/types";
import { createConfiguredSessionService } from "./configured-auth";

function usesSecureSessionCookie(): boolean {
  return !["local", "test"].includes(process.env.APP_ENV ?? "local");
}

export async function getCurrentSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(getSessionCookieName(usesSecureSessionCookie()))
    ?.value;
}

export async function getCurrentSession(): Promise<CurrentSession | null> {
  return createConfiguredSessionService().read(await getCurrentSessionToken());
}

export async function getCurrentUser(): Promise<AuthPrincipal | null> {
  return (await getCurrentSession())?.principal ?? null;
}

export async function requireUser(): Promise<AuthPrincipal> {
  return requireUserPrincipal(await getCurrentUser());
}

export async function requireSuperAdmin(): Promise<AuthPrincipal> {
  return requireSuperAdminPrincipal(await getCurrentUser());
}

export async function requireVerifiedPublishingUser(): Promise<AuthPrincipal> {
  return requireVerifiedPublishingPrincipal(await getCurrentUser());
}

export async function setSessionCookie(grant: SessionGrant): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    getSessionCookieName(usesSecureSessionCookie()),
    grant.token,
    getSessionCookieOptions(grant.session.expiresAt, usesSecureSessionCookie()),
  );
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    getSessionCookieName(usesSecureSessionCookie()),
    "",
    getExpiredSessionCookieOptions(usesSecureSessionCookie()),
  );
}
