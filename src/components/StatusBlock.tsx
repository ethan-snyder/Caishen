const border = '1px solid rgba(0,255,136,0.12)'

export function Loading({ label = 'FETCHING DATA' }: { label?: string }) {
  return (
    <div style={{
      backgroundColor: '#060E18', border, padding: '40px 20px',
      textAlign: 'center', fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12, color: '#2D6644', letterSpacing: '0.1em',
    }}>
      <span className="blink">▶</span> {label}...
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{
      backgroundColor: 'rgba(255,59,59,0.05)', border: '1px solid rgba(255,59,59,0.25)',
      padding: '18px 20px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
      color: '#FF3B3B',
    }}>
      <div style={{ marginBottom: onRetry ? 10 : 0 }}>{'// ERROR: '}{message}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{
          fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: '#FF3B3B',
          background: 'rgba(255,59,59,0.1)', border: '1px solid rgba(255,59,59,0.3)',
          padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.06em',
        }}>RETRY</button>
      )}
    </div>
  )
}
