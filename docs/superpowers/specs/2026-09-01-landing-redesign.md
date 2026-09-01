# PlanWise — Landing Page Redesign (Editorial Signal)

**Date:** 2026-09-01
**Status:** Approved for implementation

---

## Overview

`landing/` (the live, Vercel-deployed marketing site) gets restyled with the "Editorial Signal" visual system — warm paper background, ink charcoal, deep moss, signal vermilion/cyan accents, Fraunces display serif + DM Sans body — sourced from a React/Tailwind rebuild an external tool (Manus) produced from the current site as its input.

**Key finding that shaped this plan:** the Manus rebuild isn't an independent design — its animation hook (`useLandingAnimation.ts`) is a near line-for-line port of the current site's `useScrollAnimation.js` (identical scroll-pin math, same variable names), and its hero copy is word-for-word identical to the current site's. The "combine the scrolling/animation from the original with the UI from the new one" ask is therefore mostly already satisfied by the source material — the real work is adopting the new visual system without dragging in dependency weight the landing page doesn't need.

**Approach (C, of three considered):** adopt Tailwind v4, but only the actual landing-page components and the slice of the design system they use — skip the ~25 `@radix-ui/*` packages and the full shadcn/ui kit (`accordion`, `calendar`, `carousel`, `chart`, `command`, `sidebar`, etc.) that came bundled in the Manus output's generic starter template. `Home.tsx`'s own import list confirms none of the 6 landing sections reference any of it.

---

## Scope

### 1. Landing app dependency change

`landing/package.json` adds `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, and `lucide-react` (icons) to the existing `react`/`react-dom`/`vite`/`@vitejs/plugin-react`. Nothing else from the zip's dependency list is installed — no Radix packages, no `cmdk`/`recharts`/`embla-carousel-react`/`vaul`/`react-hook-form`/`react-day-picker`/`next-themes`/`sonner`/`wouter`.

### 2. Component/style port

Replace `landing/src`'s current hand-rolled-CSS section components with the zip's Tailwind-based versions, adapted to this project's actual dependency set:

| Current file | Replaced by (from zip) | Notes |
|---|---|---|
| `src/sections/Hero.jsx` | `HeroSection.tsx` → ported to `.jsx` | Drop the dead `hero-visual__image` (`display:none` in CSS, never rendered) |
| `src/sections/HowItWorks.jsx` | `HowItWorksSection.tsx` → `.jsx` | |
| `src/sections/Features.jsx` | `FeaturesSection.tsx` → `.jsx` | |
| `src/sections/Platforms.jsx` | `PlatformsSection.tsx` → `.jsx` | |
| `src/sections/CtaBand.jsx` | `CtaBand.tsx` → `.jsx` | CTA still points at `#cta` (unchanged behavior per this session — target-URL change deferred) |
| `src/sections/Footer.jsx` | `Footer.tsx` → `.jsx` | |
| `src/components/Nav.jsx` | `SiteNav.tsx` → `.jsx` | Adds the "How it works" nav link, pointing at the new page |
| `src/components/ChatDemo.jsx` | `ChatDemo.tsx` → `.jsx` | Interactive hero demo (verified working during the earlier local-run check) |
| `src/components/SectionHeader.jsx` | `SectionHeader.tsx` → `.jsx` | |
| new | `BrandMark.tsx` → `.jsx` | Wordmark component the zip factored out; not present in the current site |
| `src/hooks/useScrollAnimation.js` | kept as-is | Already functionally identical to the zip's `useLandingAnimation.ts` — no changes needed |
| `src/utils.js` | kept as-is | Same content as the zip's `landing-utils.ts`, already JS not TS |
| `src/landing.css` | replaced by a trimmed slice of the zip's `index.css` | Theme tokens (`@theme` block, color/typography custom properties) plus only the section-specific rules the 9 components above actually use — drop shadcn component-layer CSS (`.accordion`, `.calendar`, `.sidebar`, etc.) |
| `src/data/content.js` | new, from zip's `data/content.ts` → `.js` | Centralizes `CHROME_STORE_URL` and other constants already duplicated inline today |

TypeScript files are ported to plain `.jsx`/`.js` — the current landing app has no TypeScript toolchain and this change doesn't introduce one, consistent with the project's existing choice for this specific app (the main extension is also plain JS).

### 3. New "How it works" page

- New Vite multi-page entry: `landing/how-it-works.html` + `landing/src/how-it-works-main.jsx`, added to `vite.config.js`'s `build.rollupOptions.input`.
- Shares `SiteNav` and `Footer` with the homepage for visual consistency; not part of a client-side router (there isn't one, and one isn't needed for two static pages).
- Content: the existing "Detect → Extract → Sync" three-step narrative (already written copy in `HowItWorksSection`), each step paired with one of the real product screenshots from `docs/store-assets/screenshots/`:
  1. **Detect** — `1-popup-detected-plan.png` (the popup showing a plan just detected)
  2. **Extract** — `2-settings-detection.png` (detection settings/configuration)
  3. **Sync** — `3-dashboard-month-view.png` and `4-groups-rsvp.png` (calendar + shared/RSVP view)
  - `5-tasks-kanban.png` included as a closing "and there's task tracking too" note, since it's a real feature but outside the three-step narrative.
- Screenshots copied into `landing/public/how-it-works/` (following the existing `public/`-passthrough pattern already used for `confirmed.html`/`privacy.html`).

### 4. Cleanup

- Drop the `%VITE_ANALYTICS_ENDPOINT%`/`%VITE_ANALYTICS_WEBSITE_ID%` placeholder script tag from `index.html` (and the new `how-it-works.html`) — those Vercel env-var substitutions were never wired up for this project and the raw placeholder is dead weight, not a functional gap being removed.
- No `@shared/const` import carries over — it was dead code in the zip (nothing imported `const.ts`), so it's simply not ported.

### 5. Explicitly out of scope (per this session)

- CTA target-URL behavior change (same-page anchor vs. direct Chrome Web Store link) — flagged, deferred.
- Automated interaction tests (Playwright/Vitest) — not requested for this pass.
- Bundle-size optimization / lazy-loading below-the-fold sections — not requested for this pass.
- Verifying production Terms/Contact URLs — needs the user's input, not addressed here.

---

## Testing

No test suite exists for `landing/` today (it's a marketing site, not covered by the root `npm test` Jest config). Verification is manual: `npm run dev` in `landing/`, confirm both pages render without console errors, confirm the hero's interactive demo still works (click-to-capture), confirm scroll-pin animation behavior on the homepage matches the pre-redesign feel (same hook, so this should be a non-event), confirm the "How it works" page's screenshots load.

---

## Self-review

**Placeholder scan:** none — every file mapping, dependency, and content source is named explicitly.

**Internal consistency:** the "keep `useScrollAnimation.js` unchanged" decision is consistent with the earlier finding that it's already functionally identical to the zip's version — no port needed, just kept in place and imported by the new `.jsx` section components exactly as it is today.

**Scope check:** contained to `landing/` only — no changes to the Chrome extension, Supabase, or any other part of the repo. Single implementation pass, no decomposition needed.

**Ambiguity check:** "How it works" page screenshot-to-step mapping is stated explicitly (which of the 5 images goes with which step) rather than left for implementation time to decide.
