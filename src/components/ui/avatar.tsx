import { cn } from "@/lib/cn";

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase() || "N";
};

/** A person as their initials on a flat block of the accent colour. */
export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-none p-[2px]", className)} style={{ width: size, height: size, background: "var(--pop)" }}>
      <span className="grid h-full w-full place-items-center rounded-none bg-surface-1 font-[family-name:var(--font-display)] font-extrabold tracking-[0.02em] text-text" style={{ fontSize: Math.round(size * 0.44) }}>
        {initials(name)}
      </span>
    </span>
  );
}
