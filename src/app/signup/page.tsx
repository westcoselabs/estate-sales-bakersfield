import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/app/_components/auth-forms";
import { AuthShell } from "@/components/shells/shells";
import { sensitiveMetadata } from "@/platform/seo/indexing-policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  ...sensitiveMetadata,
  title: "Create your account",
};

export default function SignupPage() {
  return (
    <AuthShell
      className="auth-shell--login-portal auth-shell--signup-portal"
      eyebrow=""
      title="Create account"
      description=""
      secondary={
        <p>
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
