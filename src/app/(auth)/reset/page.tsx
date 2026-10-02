import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, linkClass } from "@/components/auth/auth-card";
import { ResetForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Reset password" };

export default function Page() {
  return (
    <AuthCard title="Choose a new password" subtitle="Then you're straight back in." footer={<><Link href="/signin" className={linkClass}>Back to sign in</Link></>}>
      <Suspense><ResetForm /></Suspense>
    </AuthCard>
  );
}
