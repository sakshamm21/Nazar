import { AppShell } from "@/components/shell/app-shell";
import { AutoRefresh } from "@/components/shell/auto-refresh";
import { requirePageUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requirePageUser();
  return (
    <AppShell user={{ name: u.name, email: u.email, isTestAccount: u.isTestAccount }}>
      <AutoRefresh />
      {children}
    </AppShell>
  );
}
