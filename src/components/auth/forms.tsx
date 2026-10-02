"use client";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { DemoButton } from "@/components/landing/demo-button";
import { linkClass } from "./auth-card";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error ?? "Something went wrong."), { code: j.code as string | undefined });
  return j;
}

function PasswordInput({ id, value, onChange, autoComplete, placeholder }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pr-11" required />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-[10px] text-subtle hover:bg-surface-3 hover:text-text">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** Sign in, with one-click test accounts (Syncronify's "Try a demo account"). */
export function SignInForm({ demoAccounts }: { demoAccounts: { label: string; email: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await post("/api/auth/login", creds ?? { email, password });
      router.push(params.get("next") ?? "/home");
      router.refresh();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "EMAIL_NOT_VERIFIED") {
        await post("/api/auth/resend", { email: creds?.email ?? email }).catch(() => null);
        router.push(`/verify?email=${encodeURIComponent(creds?.email ?? email)}`);
        return;
      }
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </Field>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-[13px] font-medium text-muted">
              Password
            </label>
            <Link href={`/forgot${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="text-[13px] font-medium text-muted hover:text-text">
              Forgot password?
            </Link>
          </div>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Your password" />
        </div>
        <FormAlert message={error} />
        <Button type="submit" size="lg" loading={busy} className="w-full">
          Sign in
        </Button>
      </form>
      {demoAccounts.length > 0 && (
        <div className="mt-7 rounded-[16px] border border-line bg-surface-2 p-4">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent" /> Fast access: test accounts (password nazar123)
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {demoAccounts.map((a) => (
              <Button key={a.email} type="button" variant="secondary" size="sm" disabled={busy} onClick={() => { setEmail(a.email); setPassword("nazar123"); void submit(undefined, { email: a.email, password: "nazar123" }); }}>
                {a.label}
              </Button>
            ))}
          </div>
          <div className="mt-3 border-t border-line pt-3">
            <DemoButton size="md" className="w-full" label="Or try a private demo, no sign-in" />
          </div>
        </div>
      )}
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
          const j = await post("/api/auth/register", { name, email, password });
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
          await post("/api/auth/verify", { email, code });
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
            const j = await post("/api/auth/resend", { email });
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
          const j = await post("/api/auth/forgot", { email });
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
          await post("/api/auth/reset", { token: params.get("token") ?? "", password });
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
