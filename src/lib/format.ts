// src/lib/format.ts

export function formatMoney(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

/** Cheap coins (e.g. SHIB) need more precision than $0.00 to be readable. */
export function formatCryptoPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  if (value < 0.01) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 8 })}`
  if (value < 1) return `$${value.toLocaleString('en-US', { maximumFractionDigits: 4 })}`
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

/** e.g. 1280000000000 -> "1.28T", 500000000 -> "500.00M" */
export function formatLargeNum(value: number | null | undefined, prefix = ''): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${prefix}${(value / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${prefix}${(value / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${prefix}${(value / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${prefix}${(value / 1e3).toFixed(2)}K`
  return `${prefix}${value.toFixed(2)}`
}

export function formatPct(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

export function formatNum(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toFixed(decimals)
}

/** Gain/loss color (green/red). Prefer <Delta /> for gain/loss figures -- it adds the ▲/▼ arrow. */
export const posNegColor = (value: number | null | undefined) =>
  value !== null && value !== undefined && value >= 0 ? '#3DDC84' : '#FF4D4D'

/**
 * The app's one date format: MM/DD/YY (with `withTime`, "MM/DD/YY h:mm AM").
 * Accepts 'YYYY-MM-DD' (treated as a local calendar date, not UTC midnight,
 * so it never shifts a day), full ISO timestamps, epoch ms, or a Date.
 */
export function fmtDate(v: string | number | Date | null | undefined, withTime = false): string {
  if (v === null || v === undefined || v === '') return '—'
  let d: Date
  if (v instanceof Date) d = v
  else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) d = new Date(`${v}T00:00:00`)
  else d = new Date(v)
  if (Number.isNaN(d.getTime())) return typeof v === 'string' ? v : '—'
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${p(d.getMonth() + 1)}/${p(d.getDate())}/${p(d.getFullYear() % 100)}`
  if (!withTime) return date
  return `${date} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}
