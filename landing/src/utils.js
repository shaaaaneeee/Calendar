export const CYCLE_MS = 9500;

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;

// Purposeful easing curves for the scroll-linked motion below - replaces
// raw linear scroll-progress -> style mapping, which reads as mechanical
// rather than cinematic no matter how well-timed the triggers are.
/** Continuous scrub feel (hero fade/lift while actively scrolling through it). */
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
/** Decelerating "settle into place" feel for discrete section reveals. */
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/** Inline position styles for a scroll-pinned inner element. */
export function stickyStyle(_mode) {
  // Keep each runway in document flow. Native sticky positioning preserves the
  // editorial scroll beat without fixed layers colliding at section boundaries.
  return { position: 'sticky', top: 0, height: '100vh', zIndex: 1 };
}

/**
 * Converts a scroll-runway multiplier to a CSS height string.
 * reducedMotion → collapses to one viewport so no scroll is needed.
 */
export function runwayHeight(multiplier, isMobile, reducedMotion) {
  if (reducedMotion) return 'auto';
  const factor = isMobile ? 0.8 : 1;
  return `calc(100vh + ${Math.round(multiplier * factor)}vh)`;
}
