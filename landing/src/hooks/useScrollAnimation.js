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
export function useScrollAnimation(refs) {
  const [state, setState] = useState(INITIAL);

  // Keep a stable ref to avoid re-running the effect when refs change
  const refsSnapshot = useRef(refs);
  refsSnapshot.current = refs;

  useEffect(() => {
    const t0 = performance.now();
    let raf;

    const tick = (now) => {
      const vh = window.innerHeight;
      const { heroRef, howRef, featuresRef, platformsRef, ctaRef } =
        refsSnapshot.current;

      const ctaEl = ctaRef?.current;

      setState({
        demoT:     (now - t0) % CYCLE_MS,
        isMobile:  window.innerWidth < 768,
        hero:      computePin(heroRef?.current,      vh),
        how:       computePin(howRef?.current,       vh),
        features:  computePin(featuresRef?.current,  vh),
        platforms: computePin(platformsRef?.current, vh),
        ctaIn: ctaEl ? ctaEl.getBoundingClientRect().top < vh * 0.82 : false,
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // empty — refsSnapshot.current is always current

  return state;
}
