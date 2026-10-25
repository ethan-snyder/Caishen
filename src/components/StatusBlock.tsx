const border = '1px solid rgba(155,89,182,0.5)'

export function Loading({ label = 'FETCHING DATA' }: { label?: string }) {
  return (
    <div style={{
      backgroundColor: '#130B1B', border, padding: '40px 20px',
      textAlign: 'center', fontFamily: "'JetBrains Mono', monospace",
      fontSize: 15, color: '#A391B5', letterSpacing: '0.1em',
    }}>
      <span className="blink">▶</span> {label}...
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{
      backgroundColor: 'rgba(255,77,77,0.05)', border: '1px solid rgba(255,77,77,0.25)',
      padding: '18px 20px', fontFamily: "'JetBrains Mono', monospace", fontSize: 15,
      color: '#FF4D4D',
    }}>
      <div style={{ marginBottom: onRetry ? 10 : 0 }}>{'// ERROR: '}{message}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{
          fontFamily: "'Share Tech Mono', monospace", fontSize: 14, color: '#FF4D4D',
          background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.3)',
          padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.06em',
        }}>RETRY</button>
      )}
    </div>
  )
}
