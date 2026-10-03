import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, linkClass } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/forms";
import { TEST_ACCOUNTS, TEST_PASSWORD } from "@/lib/demo/config";

const showDemo = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS !== "false";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <AuthCard title="Jump back in" accent="in" footer={<>New here? <Link href="/signup" className={linkClass}>Create an account</Link></>}>
      <Suspense><SignInForm demo={showDemo ? { email: TEST_ACCOUNTS[0].email, password: TEST_PASSWORD } : null} /></Suspense>
    </AuthCard>
  );
}
