import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Catches render errors so one broken page (bad API payload, a bug in a
 * single widget) shows an error panel instead of blanking the whole app.
 * App.tsx wraps the page area keyed on the active tab, so switching tabs
 * also clears a previous page's error.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div style={{
        backgroundColor: 'rgba(255,77,77,0.05)', border: '1px solid rgba(255,77,77,0.25)',
        padding: '18px 20px', fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
        color: '#FF4D4D', margin: 12,
      }}>
        <div style={{ marginBottom: 6 }}>{'// SOMETHING BROKE RENDERING THIS VIEW'}</div>
        <div style={{ color: '#C9B8D9', fontSize: 13, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
          {error.message}
        </div>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          style={{
            fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: '#FF4D4D',
            background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.3)',
            padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.06em',
          }}
        >
          RETRY
        </button>
      </div>
    )
  }
}

export default ErrorBoundary
