import "server-only";

import { getPrismaClient } from "@/platform/database/client";
import { getServerEnvironment } from "@/platform/config/env";

import { EmailCenterService } from "../application/email-center";
import { PrismaEmailCenterRepository } from "./prisma-email-center-repository";
import { ResendEmailGateway } from "./resend-email-gateway";
import { LocalCaptureEmailGateway } from "./local-capture-email-gateway";
import type { EmailGateway } from "../application/ports";
import { EmailApplicationError } from "../domain/errors";

class UnconfiguredEmailGateway implements EmailGateway {
  private unavailable(): never {
    throw new EmailApplicationError(
      "EMAIL_PROVIDER_UNAVAILABLE",
      "Email delivery is not configured.",
      503,
    );
  }
  send(): Promise<never> {
    return Promise.reject(this.unavailable());
  }
  createSegment(): Promise<never> {
    return Promise.reject(this.unavailable());
  }
  importContacts(): Promise<never> {
    return Promise.reject(this.unavailable());
  }
  getContactImportStatus(): Promise<never> {
    return Promise.reject(this.unavailable());
  }
  createBroadcast(): Promise<never> {
    return Promise.reject(this.unavailable());
  }
  sendBroadcast(): Promise<never> {
    return Promise.reject(this.unavailable());
  }
  updateContactSubscription(): Promise<never> {
    return Promise.reject(this.unavailable());
  }
}

export function createConfiguredEmailGateway(): EmailGateway {
  const env = getServerEnvironment();
  if (
    ["local", "test"].includes(env.APP_ENV) &&
    env.AUTH_EMAIL_CAPTURE_PATH
  ) {
    return new LocalCaptureEmailGateway(env.AUTH_EMAIL_CAPTURE_PATH);
  }
  return env.RESEND_API_KEY && env.RESEND_FROM
    ? new ResendEmailGateway(env.RESEND_API_KEY, env.RESEND_FROM)
    : new UnconfiguredEmailGateway();
}

export function createConfiguredEmailCenter() {
  const env = getServerEnvironment();
  return new EmailCenterService(
    new PrismaEmailCenterRepository(getPrismaClient()),
    createConfiguredEmailGateway(),
    env.APP_URL,
    env.APP_ENV === "production" &&
      env.EMAIL_CAMPAIGNS_ENABLED &&
      env.RESEND_RESOURCE_ENV === "production",
  );
}
