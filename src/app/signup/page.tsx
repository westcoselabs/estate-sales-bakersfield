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
      eyebrow="Organizer account"
      title="Create your account"
      description="Start your organizer profile and draft now. Verify your email before photos, approval, payment, or publication."
      secondary={
        <p>
          Already registered? <Link href="/login">Log in</Link>
        </p>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
