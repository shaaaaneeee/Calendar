import { useState, useEffect, useRef } from 'react';
import { clamp, CYCLE_MS } from '../utils';

/**
 * Returns { progress, mode } for a scroll-pinned section.
 * mode: 'before' | 'pin' | 'after'
 */
function computePin(el, vh) {
  if (!el) return { progress: 0, mode: 'before' };
  const rect = el.getBoundingClientRect();
  if (rect.top > 0) return { progress: 0, mode: 'before' };
  if (rect.bottom < vh) return { progress: 1, mode: 'after' };
  const total = rect.height - vh;
  const progress = total <= 0 ? 1 : clamp(-rect.top / total, 0, 1);
  return { progress, mode: 'pin' };
}

const INITIAL = {
  demoT: 0,
  isMobile: false,
  hero:      { progress: 0, mode: 'before' },
  how:       { progress: 0, mode: 'before' },
  features:  { progress: 0, mode: 'before' },
  platforms: { progress: 0, mode: 'before' },
  ctaIn: false,
};

/**
 * Drives all scroll-based and timer-based animation state for the landing page.
 * Runs a requestAnimationFrame loop; updates at ~60 fps.
 *
 * @param {{ heroRef, howRef, featuresRef, platformsRef, ctaRef }} refs
 */
// How close two progress values (0-1) need to be to count as "unchanged" -
// avoids a setState (and full re-render of every animated section) firing
// 60x/sec even when the page is sitting still.
const EPSILON = 0.0015;
const pinUnchanged = (a, b) =>
  a.mode === b.mode && Math.abs(a.progress - b.progress) < EPSILON;

export function useScrollAnimation(refs) {
  const [state, setState] = useState(INITIAL);

  // Keep a stable ref to avoid re-running the effect when refs change
  const refsSnapshot = useRef(refs);
  refsSnapshot.current = refs;

  // Mirrors `state` without triggering re-renders - lets tick() compare
  // "did anything actually change" without state being stale-closed-over.
  const prevRef = useRef(INITIAL);

  useEffect(() => {
    const t0 = performance.now();
    let raf;

    const tick = (now) => {
      const vh = window.innerHeight;
      const { heroRef, howRef, featuresRef, platformsRef, ctaRef } =
        refsSnapshot.current;

      const ctaEl = ctaRef?.current;
      const prev = prevRef.current;

      const hero = computePin(heroRef?.current, vh);

      // The hero chat demo's clock only matters while the hero is still at
      // least partially in view - freezing it once scrolled fully past (and
      // resuming if the user scrolls back up) avoids paying for a
      // continuously-ticking animation the user can no longer see.
      const demoT = hero.mode === 'after'
        ? prev.demoT
        : (now - t0) % CYCLE_MS;

      const next = {
        demoT,
        // Matches landing.css's `@media (max-width: 780px)` breakpoint, which
        // is where the pin/scrub mechanic gets disabled (position:relative,
        // runway height:auto). A mismatched threshold here would mean JS still
        // thinks it's desktop for an 8-12px band where CSS already isn't -
        // reveal animations could get stuck invisible in exactly that gap.
        isMobile:  window.innerWidth <= 780,
        hero,
        how:       computePin(howRef?.current,       vh),
        features:  computePin(featuresRef?.current,  vh),
        platforms: computePin(platformsRef?.current, vh),
        ctaIn: ctaEl ? ctaEl.getBoundingClientRect().top < vh * 0.82 : false,
      };

      const unchanged =
        next.demoT === prev.demoT &&
        next.isMobile === prev.isMobile &&
        next.ctaIn === prev.ctaIn &&
        pinUnchanged(next.hero, prev.hero) &&
        pinUnchanged(next.how, prev.how) &&
        pinUnchanged(next.features, prev.features) &&
        pinUnchanged(next.platforms, prev.platforms);

      if (!unchanged) {
        prevRef.current = next;
        setState(next);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // empty — refsSnapshot.current is always current

  return state;
}
