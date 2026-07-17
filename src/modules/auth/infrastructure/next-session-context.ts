import "server-only";

import { cookies } from "next/headers";

import { getPrismaClient } from "@/platform/database/client";

import {
  requireAdminPrincipal,
  requireUserPrincipal,
} from "../application/guards";
import {
  getExpiredSessionCookieOptions,
  getSessionCookieName,
  getSessionCookieOptions,
} from "../application/session-cookie";
import { SessionService } from "../application/session-service";
import type {
  AuthPrincipal,
  CurrentSession,
  SessionGrant,
} from "../domain/types";
import { CryptoOpaqueTokenProvider } from "./crypto-token-provider";
import { PrismaSessionRepository } from "./prisma-session-repository";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function createSessionService(): SessionService {
  return new SessionService(
    new PrismaSessionRepository(getPrismaClient()),
    new CryptoOpaqueTokenProvider(),
  );
}

export async function getCurrentSession(): Promise<CurrentSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName(isProduction()))?.value;
  return createSessionService().read(token);
}

export async function getCurrentUser(): Promise<AuthPrincipal | null> {
  return (await getCurrentSession())?.principal ?? null;
}

export async function requireUser(): Promise<AuthPrincipal> {
  return requireUserPrincipal(await getCurrentUser());
}

export async function requireAdmin(): Promise<AuthPrincipal> {
  return requireAdminPrincipal(await getCurrentUser());
}

export async function setSessionCookie(grant: SessionGrant): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    getSessionCookieName(isProduction()),
    grant.token,
    getSessionCookieOptions(grant.session.expiresAt, isProduction()),
  );
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    getSessionCookieName(isProduction()),
    "",
    getExpiredSessionCookieOptions(isProduction()),
  );
}
