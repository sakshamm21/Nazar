"use client";
import { Check, FolderPlus, Pencil, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { FormAlert, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { apiCall } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { inrCompact } from "@/lib/format";
import { selectPortfolio } from "./portfolio-tabs";

export type PortfolioSummary = { id: string; name: string; value: number; count: number };

/**
 * Your portfolios as cards: open one, rename it in place, delete it (after saying what goes with
 * it), or start another. Most people need one; a second keeps separate money separate.
 */
export function PortfolioList({ portfolios, activeId, max }: { portfolios: PortfolioSummary[]; activeId: string | null; max: number }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PortfolioSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const open = (id: string) => {
    if (id === activeId) return;
    selectPortfolio(id);
    router.refresh();
  };
  const rename = (p: PortfolioSummary) =>
    run(async () => {
      const next = name.trim();
      if (next && next !== p.name) await apiCall(`/api/portfolios/${p.id}`, "PATCH", { name: next });
      setRenaming(null);
    });
  const create = () =>
    run(async () => {
      const j = await apiCall<{ portfolio: { id: string } }>("/api/portfolios", "POST", { name: name.trim() || `Portfolio ${portfolios.length + 1}` });
      selectPortfolio(j.portfolio.id);
      setCreating(false);
      setName("");
      toast("Portfolio created. Add what it holds below.");
    });

  return (
    <section aria-label="Your portfolios">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="t-title-2 text-text">Your portfolios</h2>
        <span className="t-caption">{portfolios.length} of {max}</span>
      </div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence initial={false}>
          {portfolios.map((p) => {
            const on = p.id === activeId;
            return (
              <motion.li key={p.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.2 }} className={cn("rounded-[18px] border bg-surface-1 p-4 transition-colors", on ? "border-accent" : "border-line hover:border-line-strong")}>
                {renaming === p.id ? (
                  <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void rename(p); }}>
                    <Input autoFocus aria-label="Portfolio name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" />
                    <Button type="submit" size="sm" loading={busy} aria-label="Save name" className="h-10 w-10 shrink-0 px-0">{!busy && <Check className="h-4 w-4" />}</Button>
                    <Button type="button" variant="ghost" size="sm" aria-label="Cancel" className="h-10 w-10 shrink-0 px-0" onClick={() => setRenaming(null)}><X className="h-4 w-4" /></Button>
                  </form>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => open(p.id)} className="min-w-0 text-left" aria-label={on ? `${p.name}, open now` : `Open ${p.name}`}>
                        <span className="block truncate text-[15px] font-medium text-text">{p.name}</span>
                        <span className="num mt-1 block text-[22px] font-semibold leading-7 tracking-[-0.02em] text-text">{p.count ? inrCompact(p.value) : "Empty"}</span>
                      </button>
                      {on ? <Chip tone="accent">Open</Chip> : null}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
                      <span className="text-[12px] text-subtle">{p.count} {p.count === 1 ? "holding" : "holdings"}</span>
                      <span className="flex items-center">
                        {!on && (
                          <button onClick={() => open(p.id)} className="rounded-[9px] px-2.5 py-1.5 text-[13px] font-medium text-accent hover:bg-accent-soft">
                            Open
                          </button>
                        )}
                        <button aria-label={`Rename ${p.name}`} onClick={() => { setName(p.name); setRenaming(p.id); }} className="rounded-[9px] p-2 text-subtle hover:bg-surface-2 hover:text-text">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)} className="rounded-[9px] p-2 text-subtle hover:bg-loss-soft hover:text-loss">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </span>
                    </div>
                  </>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
        {portfolios.length < max && (
          <li>
            {creating ? (
              <form className="flex h-full flex-col justify-center gap-2 rounded-[18px] border border-accent bg-surface-1 p-4" onSubmit={(e) => { e.preventDefault(); void create(); }}>
                <Input autoFocus aria-label="New portfolio name" placeholder={`Portfolio ${portfolios.length + 1}`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="h-10 text-sm" />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={busy} className="flex-1">Create</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <button onClick={() => { setName(""); setCreating(true); }} className="flex h-full min-h-[112px] w-full flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-line-strong text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent">
                <FolderPlus className="h-5 w-5" />
                New portfolio
              </button>
            )}
          </li>
        )}
      </ul>

      <Sheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "portfolio"}?`}
        description={deleting?.count ? `Its ${deleting.count} ${deleting.count === 1 ? "holding goes" : "holdings go"} with it. This can't be undone.` : "It is empty, so nothing else is lost."}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleting(null)}>Keep it</Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={busy}
              onClick={() =>
                run(async () => {
                  const gone = deleting!;
                  await apiCall(`/api/portfolios/${gone.id}`, "DELETE");
                  setDeleting(null);
                  toast(`${gone.name} deleted.`);
                })
              }
            >
              Delete portfolio
            </Button>
          </div>
        }
      >
        <FormAlert message={error} />
      </Sheet>
    </section>
  );
}
