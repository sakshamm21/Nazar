import { AppShell } from "@/components/shell/app-shell";
import { requirePageUser } from "@/lib/current-user";
import { unreadCount } from "@/lib/repo/alerts";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requirePageUser();
  return (
    <AppShell user={{ name: u.name, isDemo: u.isDemo, isTestAccount: u.isTestAccount, demoExpiresAt: u.demoExpiresAt?.toISOString() ?? null, sim: u.simState ? { label: u.simState.label } : null }} unread={await unreadCount(u.id)}>
      {children}
    </AppShell>
  );
}
