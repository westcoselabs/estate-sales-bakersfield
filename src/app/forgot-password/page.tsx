import type { Metadata } from "next";
import Link from "next/link";

import { EmailRequestForm } from "@/app/_components/auth-forms";
import { AuthShell } from "@/components/shells/shells";
import { sensitiveMetadata } from "@/platform/seo/indexing-policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  ...sensitiveMetadata,
  title: "Reset your password",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your email. For your privacy, the confirmation is the same whether or not an eligible account exists."
      secondary={
        <p>
          Remembered it? <Link href="/login">Return to login</Link>
        </p>
      }
    >
      <EmailRequestForm
        endpoint="/api/auth/forgot-password"
        buttonLabel="Send reset link"
      />
    </AuthShell>
  );
}
