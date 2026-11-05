import { AppShell } from "@/components/shell/app-shell";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { PrefsSync } from "@/components/shell/prefs-sync";
import { requirePageUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requirePageUser();
  return (
    <AppShell user={{ name: u.name, email: u.email, isTestAccount: u.isTestAccount, demoEndsAt: u.isDemo ? (u.demoExpiresAt?.toISOString() ?? null) : null }}>
      <AutoRefresh />
      <PrefsSync model={u.prefs?.model ?? null} theme={u.prefs?.theme ?? null} />
      {children}
    </AppShell>
  );
}
