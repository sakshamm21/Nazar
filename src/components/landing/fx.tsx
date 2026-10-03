"use client";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/** Fades and lifts its content in the first time it scrolls into view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-10% 0px" }} transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

/** Leans gently towards the pointer, like a card held in the hand. */
export function Tilt({ children, className, max = 6 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0), y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [max, -max]), { stiffness: 120, damping: 18 });
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-max, max]), { stiffness: 120, damping: 18 });
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div
      className={className}
      style={{ perspective: 1200 }}
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
    const c = animate(0, to, { duration: 1.3, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => (el.textContent = `${prefix}${Math.round(v).toLocaleString("en-IN")}${suffix}`) });
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
