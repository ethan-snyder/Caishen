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

export const posNegColor = (value: number | null | undefined) =>
  value !== null && value !== undefined && value >= 0 ? '#00FF88' : '#FF3B3B'
