"use client";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { linkClass } from "./auth-card";
import { DemoButton } from "./demo-button";
import { ApiError, apiCall } from "@/lib/api-client";

function PasswordInput({ id, value, onChange, autoComplete, placeholder, label }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string; label?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} aria-label={label} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pr-11" required />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-[10px] text-subtle hover:bg-surface-3 hover:text-text">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** Sign in: one tap into the demo, or your own email and password. */
export function SignInForm({ demo }: { demo: { email: string; password: string } | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiCall("/api/auth/login", "POST", { email, password });
      router.push(params.get("next") ?? "/home");
      router.refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === "EMAIL_NOT_VERIFIED") {
        await apiCall("/api/auth/resend", "POST", { email }).catch(() => null);
        router.push(`/verify?email=${encodeURIComponent(email)}`);
        return;
      }
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      {demo && (
        <>
          <DemoButton email={demo.email} password={demo.password} className="w-full" />
          <p className="t-caption mt-2.5 text-center">One tap. A full portfolio on live prices, nothing to type.</p>
          <div className="my-6 flex items-center gap-3 text-[12px] text-subtle" aria-hidden>
            <span className="h-px flex-1 bg-line" /> or use your account <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Input id="email" aria-label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
        <PasswordInput id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Password" />
        <FormAlert message={error} />
        <Button type="submit" variant={demo ? "secondary" : "primary"} size="lg" loading={busy} className="w-full">
          Sign in
        </Button>
        <Link href={`/forgot${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="block text-center text-[13px] font-medium text-muted hover:text-text">
          Forgot password?
        </Link>
      </form>
    </>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
          const j = await apiCall("/api/auth/register", "POST", { name, email, password });
          const q = new URLSearchParams({ email: j.email });
          if (j.devCode) q.set("code", j.devCode);
          router.push(`/verify?${q}`);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <Field label="Your name" htmlFor="name">
        <Input id="name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aarav" required />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
      </Field>
      <FormAlert message={error} />
      <Button type="submit" size="lg" loading={busy} className="w-full">
        Create account
      </Button>
    </form>
  );
}

export function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const devCode = params.get("code");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(devCode ? `Email isn't set up on this server, so here's your code: ${devCode}` : null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
          await apiCall("/api/auth/verify", "POST", { email, code });
          router.push("/home");
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <Field label="6-digit code" htmlFor="code">
        <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" className="font-mono text-center text-2xl tracking-[0.5em]" required />
      </Field>
      <FormAlert message={info} tone="accent" />
      <FormAlert message={error} />
      <Button type="submit" size="lg" loading={busy} className="w-full">
        Verify and continue
      </Button>
      <button
        type="button"
        className={`${linkClass} block w-full text-center text-sm`}
        onClick={async () => {
          setError(null);
          try {
            const j = await apiCall("/api/auth/resend", "POST", { email });
            setInfo(j.devCode ? `Here's your new code: ${j.devCode}` : "We sent a new code. Check your inbox (and spam).");
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        Send a new code
      </button>
    </form>
  );
}

export function ForgotForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
          const j = await apiCall("/api/auth/forgot", "POST", { email });
          setDone(j.devResetUrl ? `Email isn't set up on this server. Use this link: ${j.devResetUrl}` : "If an account exists for that email, a reset link is on its way. It works for 30 minutes.");
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <FormAlert message={done} tone="accent" />
      <FormAlert message={error} />
      <Button type="submit" size="lg" loading={busy} className="w-full">
        Send reset link
      </Button>
    </form>
  );
}

export function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
          await apiCall("/api/auth/reset", "POST", { token: params.get("token") ?? "", password });
          router.push("/home");
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
      </Field>
      <FormAlert message={error} />
      <Button type="submit" size="lg" loading={busy} className="w-full">
        Save and sign in
      </Button>
    </form>
  );
}
