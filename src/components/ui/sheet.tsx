"use client";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * Bottom sheet on mobile, centred dialog on desktop (docs/DESIGN.md §5). Traps focus, closes on Esc and
 * on the backdrop, restores focus to the opener, and slides in over 220ms (instant if reduced motion).
 */
export function Sheet({ open, onClose, title, description, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("input,select,textarea,button:not([data-close])")?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div className="absolute inset-0 bg-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18 }} onClick={onClose} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn("relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[24px] border border-line bg-surface-1 shadow-[var(--shadow-pop)] sm:rounded-[24px]", wide ? "sm:max-w-2xl" : "sm:max-w-md")}
            initial={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
            <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
              <div>
                <h2 id={titleId} className="t-title-2 text-text">
                  {title}
                </h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              <button data-close onClick={onClose} aria-label="Close" className="-mr-1 rounded-full p-2 text-muted hover:bg-surface-2 hover:text-text">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
            {footer && <div className="sticky bottom-0 border-t border-line bg-surface-1 px-5 py-4 sm:px-6">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
