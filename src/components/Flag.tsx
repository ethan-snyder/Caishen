/**
 * Country flag as an image from flagcdn.com, keyed by ISO 3166-1 alpha-2
 * code ("us", "gb", "eu" for the euro). Images rather than emoji because
 * Windows' emoji font has no flag glyphs. A null/blank code renders
 * nothing, and a failed load hides itself rather than showing a broken
 * image icon.
 */
export function Flag({ code, size = 16 }: { code: string | null | undefined; size?: number }) {
  if (!code) return null
  const c = code.trim().toLowerCase()
  if (!/^[a-z]{2}(-[a-z]+)?$/.test(c)) return null
  return (
    <img
      src={`https://flagcdn.com/${c}.svg`}
      alt={c.toUpperCase()}
      title={c.toUpperCase()}
      width={size}
      height={Math.round(size * 0.75)}
      loading="lazy"
      onError={e => { e.currentTarget.style.display = 'none' }}
      style={{
        display: 'inline-block', objectFit: 'cover', flexShrink: 0,
        boxShadow: '0 0 0 1px rgba(212,175,55,0.25)', verticalAlign: 'middle',
      }}
    />
  )
}

export default Flag
