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

/**
 * Inline position styles for a scroll-pinned inner element.
 * Deliberately NOT native `position: sticky` - `.landing` sets
 * `overflow-x: hidden`, which per spec forces `overflow-y` to compute as
 * `auto` too, making `.landing` the nearest scrolling ancestor and breaking
 * sticky descendants (they release early / never stick reliably). Manually
 * toggling fixed while pinned, then absolute+bottom pinned to the runway's
 * own end once scrolled past, sidesteps that entirely and is what makes the
 * content hold in view for the full length of its reveal animation instead
 * of scrolling past before it finishes.
 */
export const stickyStyle = (mode) => ({
  position: mode === 'pin' ? 'fixed' : 'absolute',
  top:    mode === 'after' ? 'auto' : 0,
  bottom: mode === 'after' ? 0 : 'auto',
  left: 0,
  width: '100%',
  height: '100vh',
});

/**
 * Converts a scroll-runway multiplier to a CSS height string.
 * reducedMotion → collapses to one viewport so no scroll is needed.
 */
export const runwayHeight = (vhMult, isMobile, reducedMotion) => {
  if (reducedMotion) return '100vh';
  return isMobile ? `${Math.round(vhMult * 0.65)}vh` : `${vhMult}vh`;
};
