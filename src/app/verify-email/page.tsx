import type { Metadata } from "next";
import Link from "next/link";

import {
  EmailRequestForm,
  VerifyEmailForm,
} from "@/app/_components/auth-forms";
import { AuthShell } from "@/components/shells/shells";
import { Alert } from "@/components/ui/primitives";
import { sensitiveMetadata } from "@/platform/seo/indexing-policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  ...sensitiveMetadata,
  title: "Verify your email",
  referrer: "no-referrer",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthShell
      eyebrow="Email security"
      title="Verify your email"
      description="Verification protects your organizer account and unlocks photo, approval, payment, and publication steps."
      secondary={
        <p>
          <Link href="/login">Return to login</Link>
        </p>
      }
    >
      {token ? (
        <>
          <Alert tone="info">
            Opening this page did not change your account. Confirm below to use
            this single-use link.
          </Alert>
          <VerifyEmailForm token={token} />
        </>
      ) : (
        <>
          <p>Request a new verification link.</p>
          <EmailRequestForm
            endpoint="/api/auth/resend-verification"
            buttonLabel="Send verification link"
          />
        </>
      )}
    </AuthShell>
  );
}
