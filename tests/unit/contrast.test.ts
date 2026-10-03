/**
 * WCAG 2.2 AA: every text colour token meets 4.5:1 on every surface it is used on, in both themes.
 * Reads the tokens straight from globals.css so a palette tweak can't silently break contrast.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");
const block = (selector: RegExp) => {
  const m = css.match(selector);
  if (!m) throw new Error(`theme block not found: ${selector}`);
  return Object.fromEntries([...m[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
};
const THEMES = {
  dark: block(/:root,\s*\[data-theme="dark"\]\s*\{([^}]*)\}/),
  light: block(/\[data-theme="light"\]\s*\{([^}]*)\}/),
};

type RGBA = [number, number, number, number];
function parse(c: string): RGBA {
  const hex = c.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1) as RGBA;
  const rgb = c.match(/^rgb\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\)$/);
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3], rgb[4] ? +rgb[4] : 1];
  throw new Error(`unparsed colour ${c}`);
}
/** Alpha-composite `top` over an opaque `under`. */
const over = (top: RGBA, under: RGBA): RGBA => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1) as RGBA;
const lum = ([r, g, b]: RGBA) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: RGBA, b: RGBA) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe.each(Object.entries(THEMES))("%s theme meets WCAG AA", (_, t) => {
  const c = (k: string) => parse(t[k]);
  const surfaces = ["bg", "surface-1", "surface-2", "surface-3"];

  it.each(["text", "muted", "subtle", "accent", "gain", "loss", "warn"])("%s text ≥ 4.5:1 on every surface", (fg) => {
    for (const s of surfaces) expect(ratio(c(fg), c(s)), `${fg} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });
  it("button text on the accent fill ≥ 4.5:1", () => {
    expect(ratio(c("accent-ink"), c("accent"))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(["accent", "gain", "loss", "warn"])("%s text on its tinted chip ≥ 4.5:1", (k) => {
    for (const s of ["bg", "surface-1"]) expect(ratio(c(k), over(c(`${k}-soft`), c(s))), `${k} on ${k}-soft over ${s}`).toBeGreaterThanOrEqual(4.5);
  });
  it("text on the accent-soft selection ≥ 4.5:1", () => {
    expect(ratio(c("text"), over(c("accent-soft"), c("surface-1")))).toBeGreaterThanOrEqual(4.5);
  });
  it("strong borders and rings ≥ 3:1 against the page (non-text contrast)", () => {
    expect(ratio(c("accent"), c("bg"))).toBeGreaterThanOrEqual(3);
  });
});
