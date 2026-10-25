// src/lib/palette.ts
//
// Per-holding colors for the portfolio's allocation bar, donut, and the
// stripe on each holdings row. The first slots follow the Moneta palette
// (gold, purple and their tints); past that, hues are spread around the
// wheel by the golden angle so neighbors stay distinguishable however many
// holdings there are.

const BASE = [
  '#D4AF37', // Roman gold
  '#9B59B6', // Tyrian purple, bright
  '#E8C65A', // light gold
  '#5DADE2', // lapis
  '#B48CDB', // lavender
  '#48C9B0', // verdigris
  '#E59866', // terracotta
  '#A67C2E', // bronze
  '#F1948A', // rose
  '#7FB3D5', // pale lapis
]

export function colorAt(i: number): string {
  if (i < BASE.length) return BASE[i]
  const hue = (42 + (i - BASE.length) * 137.508) % 360
  return `hsl(${hue.toFixed(1)}, 62%, 62%)`
}

/** Stable ticker -> color map. Order matters: pass tickers in the order
 * they appear in the portfolio so a holding keeps its color across
 * re-sorts of the table (which re-orders rows, not this list). */
export function buildColorMap(tickers: string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const t of tickers) if (!map.has(t)) map.set(t, colorAt(map.size))
  return map
}
