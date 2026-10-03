"use client";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/** Slides its content in the first time it scrolls into view. */
export function Reveal({ children, from = "up", delay = 0, className }: { children: ReactNode; from?: "up" | "left" | "right"; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  const offset = from === "left" ? { x: -70, y: 0 } : from === "right" ? { x: 70, y: 0 } : { x: 0, y: 60 };
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, ...offset }} whileInView={{ opacity: 1, x: 0, y: 0 }} viewport={{ once: true, margin: "-12% 0px" }} transition={{ duration: 0.75, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

/** Leans towards the pointer, like a card held in the hand. */
export function Tilt({ children, className, max = 9 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0), y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [max, -max]), { stiffness: 140, damping: 16 });
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-max, max]), { stiffness: 140, damping: 16 });
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div
      className={className}
      style={{ perspective: 1100 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width - 0.5);
        y.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      <motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>{children}</motion.div>
    </div>
  );
}

/** A number that counts up to its value when it comes into view. */
export function CountUp({ to, prefix = "", suffix = "", className }: { to: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || !seen || reduce) return;
    const c = animate(0, to, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => (el.textContent = `${prefix}${Math.round(v).toLocaleString("en-IN")}${suffix}`) });
    return () => c.stop();
  }, [seen, to, prefix, suffix, reduce]);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {to.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}
