import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, linkClass } from "@/components/auth/auth-card";
import { VerifyForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Verify email" };

export default function Page() {
  return (
    <AuthCard title="Check your email" subtitle="Enter the 6-digit code we sent you. It expires in 10 minutes." footer={<><Link href="/signin" className={linkClass}>Back to sign in</Link></>}>
      <Suspense><VerifyForm /></Suspense>
    </AuthCard>
  );
}
