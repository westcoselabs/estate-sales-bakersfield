import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/app/_components/auth-forms";
import { AuthShell } from "@/components/shells/shells";
import { Alert } from "@/components/ui/primitives";
import { sensitiveMetadata } from "@/platform/seo/indexing-policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  ...sensitiveMetadata,
  title: "Choose a new password",
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Use a strong, unique password. Completing this step securely signs out every existing session."
      secondary={
        <p>
          Need another link? <Link href="/forgot-password">Request one</Link>
        </p>
      }
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert tone="error" title="This link cannot be used">
          This reset link is invalid or incomplete.
        </Alert>
      )}
    </AuthShell>
  );
}
