import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, linkClass } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return (
    <AuthCard title="Create your account" subtitle="Takes a minute. We'll email you a 6-digit code." footer={<>Already have an account? <Link href="/signin" className={linkClass}>Sign in</Link></>}>
      <Suspense><SignUpForm /></Suspense>
    </AuthCard>
  );
}
