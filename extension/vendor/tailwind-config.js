tailwind.config = {
  theme: {
    extend: {
      colors: {
        'background':   '#f9f9f9',
        'surface':      '#f9f9f9',
        'surface-low':  '#f4f3f3',
        'surface-mid':  '#eeeeee',
        'surface-high': '#e8e8e8',
        'surface-top':  '#e2e2e2',
        'on-surface':   '#1a1c1c',
        'on-muted':     '#4c4546',
        'primary':      '#000000',
        'on-primary':   '#ffffff',
        'secondary':    '#5d5f5f',
        'outline':      '#1a1c1c',
        'outline-soft': '#cfc4c5',
        'error':        '#ba1a1a',
        'error-bg':     '#ffdad6',
        'status-active':'#00D1FF',
        'status-ok':    '#7EFF00',
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
        'neo':    '4px 4px 0px 0px rgba(0,0,0,1)',
        'neo-sm': '2px 2px 0px 0px rgba(0,0,0,1)',
        'neo-xs': '1px 1px 0px 0px rgba(0,0,0,1)',
      },
    },
  },
};
