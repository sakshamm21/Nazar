# Nazar design system: "The watchful eye"

Nazar is a calm, precise instrument for money: closer to CRED, Linear, Arc or Apple Wallet than to a trading terminal. It should feel beautiful to a first-time investor and trustworthy to a careful one. The identity is strong but quiet: one motif, one accent, generous space.

The live style guide is at **`/design`**. It renders every token and component in both themes from the same code the app uses.

---

## 1. The motif: concentric rings

The nazar amulet is concentric rings. The ring is the **only** brand shape, and it always does a job:

| Use | Component | What the ring means |
|---|---|---|
| Logo | `NazarMark` | Two rings and a pupil: an eye that watches. |
| Portfolio health | `RingGauge` | Outer ring = overall health (0–100). Inner ring = diversification and risk. Fills on load. |
| "Watching" status | `WatchingStatus` | A small ring that breathes slowly: "Nazar is watching · 14 stocks · last check 4:47 PM". |
| Loading | `IrisLoader` | Rings expanding like an iris. Never a spinner. |
| Empty and "all quiet" | `QuietRings` | Faint still rings behind calm copy: "All quiet today. Nothing needs your attention." |
| Alert severity | `SeverityIcon` | Filled ring = critical, half ring = important, dot = info (shape *and* colour, never colour alone). |

Never use rings as decoration without one of these jobs. No other illustrative shapes.

---

## 2. Colour tokens

Every colour is a semantic token defined in `src/app/globals.css`. Themes differ **only** in token values. Components never use raw hex or Tailwind palette colours.

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `--bg` | `#0A0F1C` ink navy | `#F5F7FA` porcelain | Page background |
| `--surface-1` | `#0F1627` | `#FFFFFF` | Cards |
| `--surface-2` | `#141D31` | `#F0F3F8` | Raised elements inside cards, inputs |
| `--surface-3` | `#1B253C` | `#E6EBF3` | Hover, pressed, tracks |
| `--line` | `#1F2A43` | `#E1E6EF` | Hairline borders |
| `--line-strong` | `#2C3854` | `#CBD3E1` | Focus-adjacent borders, dividers that must be seen |
| `--text` | `#E9EEF8` | `#0E1424` | Primary text |
| `--muted` | `#9DA9C2` | `#4C586F` | Secondary text |
| `--subtle` | `#7F8BA6` | `#5F6B83` | Captions and meta (meets 4.5:1 on its background) |
| `--accent` | `#5B86FF` nazar blue | `#2B54F0` | The single brand accent: primary actions, focus, active tab, gauge |
| `--accent-ink` | `#06102B` | `#FFFFFF` | Text on accent fills |
| `--ice` | `#A9C4FF` | `#DCE6FF` | Soft companion to the accent: inner ring, tints |
| `--accent-soft` | accent at 14% | accent at 10% | Selected backgrounds |
| `--gain` | `#3CCBA8` teal-green | `#0B7A64` | Gains, always with "+" or ▲ |
| `--loss` | `#FF8169` coral | `#C03D29` | Losses, always with "−" or ▼ |
| `--warn` | `#F2B85B` | `#9A5B00` | Stale data, cautions |

Rules:
- **The accent is used sparingly**: one primary action per view, the active nav item, the health gauge, focus rings.
- Gains and losses are **never** the brand blue, and they always carry a sign or arrow, so they read without colour.
- No glows, no gradients on surfaces, no neon. Depth comes from layered surfaces, hairlines and soft shadows.
- Contrast: body text ≥ 4.5:1 and large text ≥ 3:1 in both themes (checked in `tests/unit/contrast.test.ts`).

## 3. Typography

| Role | Family | Notes |
|---|---|---|
| Display and big numbers | **Sora** (600/700) | Portfolio value, headings, gauge numbers |
| UI and body | **Inter** (400/500/600) | Everything else |
| Tickers and codes | **IBM Plex Mono** (500) | `INFY.NS`, verification codes |
| Hindi | **Noto Sans Devanagari** (400/500/600) | Added to every stack, so Hindi renders cleanly beside Latin |

**Tabular figures everywhere** for numbers (`.num` → `font-variant-numeric: tabular-nums`).

| Token | Size / line | Use |
|---|---|---|
| `display` | 44/48 Sora 600, −0.02em (32/36 on mobile) | Hero portfolio value |
| `title-1` | 28/34 Sora 600 | Page titles |
| `title-2` | 20/28 Sora 600 | Card titles |
| `body` | 15/24 Inter | Body |
| `small` | 13/20 Inter | Secondary |
| `caption` | 12/16 Inter 500, +0.02em | Meta, labels |
| `overline` | 11/16 Inter 600, +0.08em, uppercase | Section labels |

## 4. Space, shape and depth

- **Spacing scale (px):** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56. Cards use 20px padding on mobile and 24px on desktop. Sections are separated by 24–32px.
- **Radius:** cards 20px (`--radius-card`), inner elements 14px (`--radius-inner`), pills 999px.
- **Borders:** 1px hairline `--line` on every card.
- **Shadow:** `--shadow-card` is a soft two-layer shadow. It is barely visible in dark mode, where depth comes from surfaces.
- **Density:** at most about 6 numbers visible in a card at once. Avoid Zerodha-style tables on Home. Detail lives one tap deeper.

## 5. Layout

- **Mobile-first.** The bottom tab bar has Home, Alerts, Ask, Portfolio and Settings. Pickers and forms open as bottom sheets.
- **Desktop (≥ 1024px):** a slim 232px sidebar and a content column of at most 1120px. Home uses a two-column grid.
- Page gutters are 16px on mobile, 24px on tablet and 32px on desktop. No horizontal scroll at 375px.

## 6. Components

| Component | File | Notes |
|---|---|---|
| `Card` | `ui/card.tsx` | Surface-1, hairline, 20px radius. `CardHeader` takes an overline and a title. |
| `Button` | `ui/button.tsx` | `primary` (accent), `secondary` (surface-2 + hairline), `ghost`, `danger`. 44px minimum touch target. |
| `Chip` | `ui/chip.tsx` | Neutral, accent, gain, loss and warn tones. |
| `Delta` | `ui/delta.tsx` | ₹ or % change with ▲/▼ and sign. Colour comes from the token. |
| `AnimatedNumber` | `ui/animated-number.tsx` | Short odometer roll (≈ 400ms) on change. Static under reduced motion. |
| `RingGauge` | `rings/ring-gauge.tsx` | Two concentric arcs that fill on mount. |
| `WatchingStatus` | `rings/watching.tsx` | Breathing ring with the status line. |
| `IrisLoader`, `QuietRings`, `NazarMark` | `rings/*` | See §1. |
| `SeverityIcon` | `ui/severity.tsx` | Filled ring, half ring or dot. |
| `Sheet` | `ui/sheet.tsx` | A bottom sheet on mobile and a centred dialog on desktop. Traps focus and closes on Esc. |
| `InfoTip` | `ui/info-tip.tsx` | "What does this mean?" with plain-language glossary entries for every metric. |
| `Sparkline`, `PriceChart` | `charts/*` | Thin 1.5px lines, a fading gradient fill, a crosshair tooltip and no gridlines. |
| `Skeleton` | `ui/skeleton.tsx` | Content-shaped blocks, never generic bars. |
| `EmptyState` | `ui/empty.tsx` | Quiet rings, one sentence and one action. |

## 7. Motion

- Duration **150–250ms**, `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out). Nothing bounces or springs.
- Named motions:
  - **breathe:** the watching ring scales 1 → 1.06 and fades 0.9 → 0.55 over 3.6s, ease-in-out, infinite.
  - **gauge fill:** 700ms ease-out on mount.
  - **number roll:** 400ms.
  - **sheet:** slides up in 220ms.
  - **iris:** rings expand and fade over 1.4s.
- `prefers-reduced-motion: reduce` turns all of these off: instant states, no breathing, no rolling.

## 8. Voice

Calm, direct, slightly warm. Never hype. We explain; we don't instruct.

| Do | Don't |
|---|---|
| "All quiet today. Nothing needs your attention." | "🚀 Your stocks are on fire!" |
| "Tata Motors fell 7%. Here's why, and what it means for you." | "Tata Motors CRASHES! Act now!" |
| "Likely reason: the whole market fell today." | "Experts say this is a buying opportunity." |
| "Health score 7/9, unchanged; it updates with full-year results." | "Strong buy on fundamentals." |

The **hard rule** is that Nazar never says buy, sell, hold, target price or anything that reads as a personal recommendation. The `noAdvice` guard enforces it in tests and at runtime, in English, Hindi and Hinglish.

## 9. Do's and don'ts

**Do:** one accent per view, generous whitespace, signs and arrows on every change, "as of" times on every number from the market, Hindi set in Noto Sans Devanagari, 44px touch targets, visible focus rings.

**Don't** borrow from Syncronify's identity, or from trading-app clichés:
- no acid lime or electric violet
- no warm cream or paper backgrounds
- no Bricolage Grotesque, Geist or Instrument Serif
- no grain, marquees, floating sticker shapes or neon glows
- no red/green-only signalling
- no dense tables on Home
- no FOMO language, rockets or "to the moon"
