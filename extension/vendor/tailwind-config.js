tailwind.config = {
  theme: {
    extend: {
      colors: {
        // Theme-aware tokens - actual values come from theme.css's
        // :root / [data-theme="dark"] custom properties.
        'background':   'var(--c-bg)',
        'surface':      'var(--c-bg)',
        'surface-low':  'var(--c-bg-low)',
        'surface-mid':  'var(--c-bg-mid)',
        'surface-high': 'var(--c-bg-high)',
        'surface-top':  'var(--c-bg-top)',
        'on-surface':   'var(--c-text)',
        'on-muted':     'var(--c-muted)',
        'primary':      'var(--c-primary)',
        'on-primary':   'var(--c-on-primary)',
        'secondary':    'var(--c-muted)',
        'outline':      'var(--c-outline)',
        'outline-soft': 'var(--c-outline-soft)',
        'error':        'var(--c-error)',
        'error-bg':     'var(--c-error-bg)',
        // PlanWise's signature accents - deliberately NOT theme-aware,
        // identical in light and dark mode.
        'status-active':'#00D1FF',
        'status-ok':    '#1f6e35',
        'status-crit':  '#FF4D00',
      },
      borderRadius: {
        DEFAULT: '0px', none: '0px', sm: '0px',
        md: '0px', lg: '0px', xl: '0px', full: '9999px',
      },
      fontFamily: {
        sans: ['Geist', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        // Hard-offset shadows flip white-on-dark in dark mode via
        // --c-shadow, keeping the same neo-brutalist silhouette.
        'neo':    '4px 4px 0px 0px var(--c-shadow)',
        'neo-sm': '2px 2px 0px 0px var(--c-shadow)',
        'neo-xs': '1px 1px 0px 0px var(--c-shadow)',
      },
    },
  },
};
