"use client";
import { BadgeCheck, Check, KeyRound, LogOut, Pencil, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { apiCall } from "@/lib/api-client";
import { inrCompact } from "@/lib/format";

export type Profile = {
  name: string;
  email: string;
  emailVerified: boolean;
  isTestAccount: boolean;
  memberSince: string;
  stats: { portfolios: number; holdings: number; watching: number; alertsRated: number; netWorth: number | null };
};

/** Who you are in Nazar: name (editable in place), email, what you track, and account actions. */
export function ProfileCard({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(false);
  const first = profile.name.split(" ")[0];

  const saveName = async () => {
    const next = name.trim();
    if (!next) return toast.error("Your name can't be empty.");
    if (next === profile.name) return setEditing(false);
    setBusy(true);
    try {
      await apiCall("/api/settings", "PATCH", { name: next });
      toast(`Nice to meet you, ${next.split(" ")[0]}.`);
      setEditing(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stats: { label: string; value: string }[] = [
    ...(profile.stats.netWorth != null ? [{ label: "Tracked", value: inrCompact(profile.stats.netWorth) }] : []),
    { label: profile.stats.portfolios === 1 ? "Portfolio" : "Portfolios", value: String(profile.stats.portfolios) },
    { label: "Holdings", value: String(profile.stats.holdings) },
    { label: "Watching", value: String(profile.stats.watching) },
    { label: "Alerts rated", value: String(profile.stats.alertsRated) },
  ];

  return (
    <Card className="nz-ring nz-aura overflow-hidden p-5 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar name={profile.name} size={84} />
        <div className="min-w-0 flex-1">
          <div className="t-overline">Your profile</div>
          {editing ? (
            <form
              className="mt-1.5 flex max-w-sm items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveName();
              }}
            >
              <Input autoFocus aria-label="Your name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              <Button type="submit" size="sm" loading={busy} aria-label="Save name" className="h-11 w-11 shrink-0 px-0">
                {!busy && <Check className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="ghost" size="sm" aria-label="Cancel" className="h-11 w-11 shrink-0 px-0" onClick={() => { setName(profile.name); setEditing(false); }}>
                <X className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <div className="mt-0.5 flex items-center gap-2">
              <h1 className="t-title-1 min-w-0 truncate text-text">
                Hey, <span className="t-accent nz-grad pr-1">{first}</span>
              </h1>
              {!profile.isTestAccount && (
                <button onClick={() => setEditing(true)} aria-label="Edit your name" className="rounded-full p-2 text-subtle hover:bg-surface-2 hover:text-text">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted">
            <span className="truncate">{profile.name === first ? profile.email : `${profile.name} · ${profile.email}`}</span>
            {profile.isTestAccount ? (
              <Chip tone="warn">Shared test account</Chip>
            ) : profile.emailVerified ? (
              <Chip tone="gain">
                <BadgeCheck className="h-3 w-3" /> Verified
              </Chip>
            ) : (
              <Chip tone="warn">Email not verified</Chip>
            )}
          </div>
          <div className="t-caption mt-1.5">With Nazar since {profile.memberSince}</div>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[16px] border border-line bg-surface-2/70 px-3.5 py-3">
            <dd className="num text-[22px] font-bold leading-7 text-text">{s.value}</dd>
            <dt className="text-[12px] text-subtle">{s.label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5">
        {!profile.isTestAccount && (
          <Button variant="secondary" size="sm" onClick={() => setPassword(true)}>
            <KeyRound className="h-4 w-4" /> Change password
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await apiCall("/api/auth/logout", "POST");
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
        {!profile.isTestAccount && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-loss hover:bg-loss-soft hover:text-loss"
            onClick={async () => {
              if (!confirm("Delete your account and all your portfolios, alerts and chats? This can't be undone.")) return;
              await apiCall("/api/account", "DELETE");
              router.push("/");
              router.refresh();
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete account
          </Button>
        )}
      </div>
      {profile.isTestAccount && <p className="t-caption mt-3">Everyone who picks this test account shares it, and it is put back to its starting state every night. Create your own account to keep your portfolio.</p>}
      <PasswordSheet open={password} onClose={() => setPassword(false)} />
    </Card>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setCurrent("");
    setNext("");
    setError(null);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title="Change password"
      description="You stay signed in on this device."
      footer={
        <Button
          className="w-full"
          loading={busy}
          onClick={async () => {
            setError(null);
            setBusy(true);
            try {
              await apiCall("/api/account/password", "POST", { current, next });
              toast("Password changed.");
              close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save new password
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Current password" htmlFor="pw-current">
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="pw-next" hint="At least 8 characters.">
          <Input id="pw-next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <FormAlert message={error} />
      </div>
    </Sheet>
  );
}
