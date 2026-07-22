import "server-only";

import { revalidatePath } from "next/cache";

import { PrismaEventRepository } from "@/modules/events";
import { getServerApplicationUrl } from "@/platform/config/application-url";
import {
  getServerEnvironment,
  type ServerEnvironment,
} from "@/platform/config/env";
import { getPrismaClient } from "@/platform/database/client";

import { PaymentService } from "../application/payment-service";
import type { PublicationCache, StripeProvider } from "../application/ports";
import type { PublicationPrice } from "../domain/types";
import {
  cancelFakeCheckout,
  completeFakeCheckout,
  FakeStripeProvider,
  fakeCheckoutDetails,
} from "./fake-stripe-provider";
import { PrismaPaymentRepository } from "./prisma-payment-repository";
import { StripeCheckoutProvider } from "./stripe-checkout-provider";

export const FIXTURE_PUBLICATION_PRICE: PublicationPrice = {
  priceId: "price_test_phase4_fixture",
  amount: 1234,
  currency: "usd",
  fixture: true,
};

class NextPublicationCache implements PublicationCache {
  revalidate(canonicalPath: string): void {
    revalidatePath(canonicalPath);
    revalidatePath("/dashboard");
  }
}

function configuredPrice(
  environment: ServerEnvironment,
): PublicationPrice | null {
  if (environment.APP_ENV === "local" || environment.APP_ENV === "test") {
    return FIXTURE_PUBLICATION_PRICE;
  }
  if (
    !environment.STRIPE_PRICE_ID ||
    !environment.STRIPE_EXPECTED_AMOUNT ||
    !environment.STRIPE_EXPECTED_CURRENCY
  ) {
    return null;
  }
  return {
    priceId: environment.STRIPE_PRICE_ID,
    amount: environment.STRIPE_EXPECTED_AMOUNT,
    currency: environment.STRIPE_EXPECTED_CURRENCY,
    fixture: false,
  };
}

function configuredProvider(
  environment: ServerEnvironment,
  price: PublicationPrice | null,
): StripeProvider | null {
  if (
    (environment.APP_ENV === "local" || environment.APP_ENV === "test") &&
    price
  ) {
    return new FakeStripeProvider(getServerApplicationUrl(), price);
  }
  if (
    environment.STRIPE_SECRET_KEY &&
    environment.STRIPE_WEBHOOK_SECRET &&
    price
  ) {
    return new StripeCheckoutProvider(
      environment.STRIPE_SECRET_KEY,
      environment.STRIPE_WEBHOOK_SECRET,
    );
  }
  return null;
}

export function getConfiguredPublicationPrice(): PublicationPrice | null {
  return configuredPrice(getServerEnvironment());
}

export function createConfiguredPaymentService(): PaymentService {
  const environment = getServerEnvironment();
  const price = configuredPrice(environment);
  const prisma = getPrismaClient();
  return new PaymentService(
    new PrismaPaymentRepository(prisma),
    new PrismaEventRepository(prisma),
    configuredProvider(environment, price),
    price,
    environment.APP_ENV,
    getServerApplicationUrl(),
    new NextPublicationCache(),
  );
}

function requireFakeEnvironment(): void {
  if (!["local", "test"].includes(getServerEnvironment().APP_ENV)) {
    throw new Error("The fake Stripe workflow is unavailable");
  }
}

export function getConfiguredFakeCheckout(sessionId: string) {
  requireFakeEnvironment();
  return fakeCheckoutDetails(sessionId);
}

export function completeConfiguredFakeCheckout(sessionId: string) {
  requireFakeEnvironment();
  return completeFakeCheckout(sessionId);
}

export function cancelConfiguredFakeCheckout(sessionId: string) {
  requireFakeEnvironment();
  return cancelFakeCheckout(sessionId);
}
