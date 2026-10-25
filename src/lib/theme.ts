// src/lib/theme.ts
//
// Moneta palette — imperial (Tyrian) purple + Roman gold on near-black.
// Components still use inline style objects (see AGENTS.md); import these
// tokens instead of hard-coding hex values so the palette stays in one place.
//
// Rule of thumb: numbers are always WHITE. Direction (gain/loss) is shown
// only by the colored ▲/▼ arrow from <Delta /> — never by tinting the
// number itself — so green/red never fights with the gold/purple chrome.

export const C = {
  bg: '#0A0610',          // page background
  shell: '#07040B',       // sidebar / top bar
  card: '#130B1B',        // panels
  inset: '#0D0814',       // wells inside panels
  tooltip: '#1C1226',

  gold: '#D4AF37',        // primary accent (Roman gold)
  goldBright: '#E8C65A',  // hover
  goldDeep: '#A67C2E',
  purple: '#6B2A7A',      // Tyrian purple
  purpleBright: '#9B59B6',
  purpleSoft: '#B48CDB',

  number: '#FFFFFF',      // every numeric value
  text: '#F4EFE6',        // ivory / marble for headings and names
  textSoft: '#C9B8D9',    // secondary text
  muted: '#8C7A9E',       // labels
  dim: '#5E4D70',         // tertiary labels, footnotes

  up: '#3DDC84',          // gain arrow only
  down: '#FF4D4D',        // loss arrow only
  neutral: '#F2C94C',     // "neutral" sentiment readings
  warn: '#FF8C00',
} as const

export const goldA = (a: number) => `rgba(212,175,55,${a})`
export const purpleA = (a: number) => `rgba(107,42,122,${a})`

// Box outline: soft glowing purple (the glow comes from index.css, keyed on
// this exact color). Clicking a box turns its outline gold -- see App.tsx.
export const BOX_PURPLE = 'rgba(155,89,182,0.5)'
export const BOX_PURPLE_HOVER = 'rgba(180,140,219,0.85)'
export const border = `1px solid ${BOX_PURPLE}`
export const borderHover = BOX_PURPLE_HOVER

/** Horizontal gridline drawn at every y-axis label in every chart. */
export const GRID_LINE = 'rgba(155,89,182,0.32)'

export const FONT = {
  display: "'Twemoji Country Flags', 'Cinzel', 'Trajan Pro', Georgia, serif",
  terminal: "'Twemoji Country Flags', 'Share Tech Mono', 'Courier New', monospace",
  mono: "'Twemoji Country Flags', 'JetBrains Mono', 'Courier New', monospace",
} as const
