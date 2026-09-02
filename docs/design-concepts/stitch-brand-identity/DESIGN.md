---
name: PlanWise
colors:
  surface: '#f9f9f9'
  primary: '#000000'
  on-primary: '#ffffff'
  on-surface: '#1a1c1c'
  on-muted: '#4c4546'
  outline: '#1a1c1c'
  status-crit: '#FF4D00'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface-variant: '#4c4546'
  inverse-surface: '#303030'
  inverse-on-surface: '#f1f1f1'
  outline-variant: '#cfc4c5'
  surface-tint: '#5e5e5e'
  primary-container: '#1b1b1b'
  on-primary-container: '#848484'
  inverse-primary: '#c6c6c6'
  secondary: '#5d5f5f'
  on-secondary: '#ffffff'
  secondary-container: '#dfe0e0'
  on-secondary-container: '#616363'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b1b1b'
  on-tertiary-container: '#848484'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c6'
  on-tertiary-fixed: '#1b1b1b'
  on-tertiary-fixed-variant: '#474747'
  background: '#f9f9f9'
  on-background: '#1b1b1b'
  surface-variant: '#e2e2e2'
typography:
  family-sans: Geist, sans-serif
  family-mono: JetBrains Mono, monospace
  base-size: 16px
  scale: 1.2
  headline-xl:
    fontFamily: geist
    fontSize: 33px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: geist
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-md:
    fontFamily: geist
    fontSize: 23px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: geist
    fontSize: 19px
    fontWeight: '400'
    lineHeight: '1.5'
  body-md:
    fontFamily: geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: jetbrainsMono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: jetbrainsMono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.08em
shadows:
  hard-sm: '2px 2px 0px #000000'
  hard-md: '4px 4px 0px #000000'
border-radius:
  none: 0px
  pill: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin: 24px
  container-max: 1200px
---

# PlanWise Design Language

## Visual Principles
- **Neo-Brutalist Precision**: Hard edges, zero border-radius (except pills), and high-contrast black outlines (`#1a1c1c`).
- **Depth**: Physicality is achieved through hard-offset shadows (`4px 4px 0px #000`) rather than gradients or blurs.
- **Typography**: Geist (Sans) for primary communication and wordmarks; JetBrains Mono for small, tracked-uppercase labels and metadata.
- **Color Discipline**: A strictly off-white (`#f9f9f9`) and black (`#000000`) palette, with `#FF4D00` used as a singular, surgical accent for status or highlights.