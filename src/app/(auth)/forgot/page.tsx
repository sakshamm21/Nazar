import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, linkClass } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Forgot password" };

export default function Page() {
  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new one." footer={<><Link href="/signin" className={linkClass}>Back to sign in</Link></>}>
      <Suspense><ForgotForm /></Suspense>
    </AuthCard>
  );
}
