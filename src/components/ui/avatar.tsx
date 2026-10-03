import { cn } from "@/lib/cn";

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase() || "N";
};

/** A person as their initials on the brand gradient, inside a ring (the Nazar shape). */
export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full p-[2px]", className)} style={{ width: size, height: size, background: "linear-gradient(135deg, var(--accent), var(--pop) 60%, var(--pop-2))" }}>
      <span className="grid h-full w-full place-items-center rounded-full bg-surface-1 font-[family-name:var(--font-display)] font-bold tracking-[-0.03em] text-text" style={{ fontSize: Math.round(size * 0.36) }}>
        {initials(name)}
      </span>
    </span>
  );
}
