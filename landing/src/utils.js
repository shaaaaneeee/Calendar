export const CYCLE_MS = 9500;
export const ACCENT   = '#00D1FF';
export const PRIMARY  = '#000000';
export const ON_PRIMARY = '#FFFFFF';

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp  = (a, b, t) => a + (b - a) * t;

/** Neobrutalist box-shadow offset */
export const sh = (n) => `${n}px ${n}px 0 #000000`;

/** Inline position styles for a scroll-pinned inner element. */
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
