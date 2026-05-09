import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../App.jsx'
import { api } from '../api.js'
import StatusPill from '../components/StatusPill.jsx'

const PROVIDERS = [
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    icon: '📅',
    desc: 'Sync upcoming appointments and events for automated daily reminders.',
  },
  {
    id: 'google_mail',
    name: 'Gmail',
    icon: '📧',
    desc: 'Scan emails for phishing attempts, scam solicitations, and unusual requests.',
  },
]

function normalizeProvider(value) {
  const key = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (key === 'gmail' || key === 'google_mail' || key.includes('gmail') || (key.includes('google') && key.includes('mail'))) {
    return 'google_mail'
  }
  if (key === 'google_calendar' || key.includes('calendar')) return 'google_calendar'
  return key
}

export default function Integrations() {
  const { seniorId, toast } = useApp()
  const [connections, setConnections]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [syncing, setSyncing]           = useState(false)
  const [summarizing, setSummarizing]   = useState(false)
  const [emailSummary, setEmailSummary] = useState(null)
  const [connecting, setConnecting]     = useState({})
  const refreshTimer = useRef(null)

  const fetchConnections = useCallback(async (showError = true, showLoading = true) => {
    if (!seniorId) return
    if (showLoading) setLoading(true)
    try {
      setConnections(await api(`/api/seniors/${seniorId}/hyperspell/connections`))
    } catch (e) {
      if (showError) toast(e.message, 'error')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [seniorId, toast])

  useEffect(() => {
    queueMicrotask(() => fetchConnections())
  }, [fetchConnections])

  useEffect(() => {
    const refreshQuietly = () => fetchConnections(false, false)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshQuietly()
    }

    window.addEventListener('focus', refreshQuietly)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', refreshQuietly)
      document.removeEventListener('visibilitychange', handleVisibility)
      if (refreshTimer.current) window.clearInterval(refreshTimer.current)
    }
  }, [fetchConnections])

  const handleConnect = async (providerId) => {
    setConnecting(prev => ({ ...prev, [providerId]: true }))
    try {
      const res = await api(`/api/seniors/${seniorId}/hyperspell/connect`, {
        method: 'POST',
        body: { provider: providerId },
      })
      if (res.url) {
        window.open(res.url, '_blank')
        toast('Google authorization opened in a new tab. Return here after granting access.', 'info')
        if (refreshTimer.current) window.clearInterval(refreshTimer.current)
        let attempts = 0
        refreshTimer.current = window.setInterval(() => {
          attempts += 1
          fetchConnections(false, false)
          if (attempts >= 20) {
            window.clearInterval(refreshTimer.current)
            refreshTimer.current = null
          }
        }, 3000)
      } else {
        toast('No OAuth URL returned — check Hyperspell configuration.', 'error')
      }
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setConnecting(prev => ({ ...prev, [providerId]: false }))
    }
  }

  const handleSyncAll = async () => {
    setSyncing(true)
    try {
      const res = await api(`/api/seniors/${seniorId}/hyperspell/sync`, { method: 'POST' })
      const ev = res.calendarEvents ?? 0
      const sc = res.scamAlerts ?? 0
      toast(`Synced ${ev} calendar event${ev !== 1 ? 's' : ''} · ${sc} scam alert${sc !== 1 ? 's' : ''}.`)
      fetchConnections(false, false)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleEmailSummary = async () => {
    setSummarizing(true)
    try {
      const res = await api(`/api/seniors/${seniorId}/hyperspell/email-summary`, {
        method: 'POST',
        body: { days: 2 },
      })
      setEmailSummary(res)
      toast(`Email summary found ${res.importantCount ?? 0} important item${res.importantCount === 1 ? '' : 's'} and marked ${res.scamCount ?? 0} scam${res.scamCount === 1 ? '' : 's'}.`)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSummarizing(false)
    }
  }

  const getConn = (id) => connections.find(c => normalizeProvider(c.provider ?? c.source) === id)
  const anyConnected = connections.length > 0
  const gmailConnected = !!getConn('google_mail')

  if (!seniorId) return (
    <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
      Configure a Senior ID using the gear icon.
    </p>
  )

  return (
    <>
      <div className="int-page fade-in">
        <div className="page-header">
          <div>
            <h1>Integrations</h1>
            <p className="page-sub">Connect the senior's Google accounts to enable automated syncing and scam detection.</p>
          </div>
          {anyConnected && (
            <button className="glass-btn primary" onClick={handleSyncAll} disabled={syncing} style={{ flexShrink: 0 }}>
              {syncing ? '⟳ Syncing…' : '↻ Sync All'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="provider-grid">
            {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 190, borderRadius: 16 }} />)}
          </div>
        ) : (
          <div className="provider-grid stagger">
            {PROVIDERS.map(p => {
              const conn = getConn(p.id)
              const connected = !!conn
              const busy = !!connecting[p.id]

              return (
                <div key={p.id} className={`provider-card glass-card${connected ? ' is-connected' : ''}`}>
                  <div className="pc-head">
                    <div className="pc-icon-box">
                      <span className="pc-icon">{p.icon}</span>
                    </div>
                    <div>
                      <h3 className="pc-name">{p.name}</h3>
                      <StatusPill status={connected ? 'connected' : 'disconnected'} />
                    </div>
                  </div>
                  <p className="pc-desc">{p.desc}</p>
                  {connected && conn.lastSynced && (
                    <p className="pc-synced">
                      Last synced {new Date(conn.lastSynced).toLocaleString()}
                    </p>
                  )}
                  <button
                    className={`glass-btn${connected ? '' : ' primary'}`}
                    onClick={() => handleConnect(p.id)}
                    disabled={busy}
                  >
                    {busy ? '⟳ Opening…' : connected ? '⟳ Reconnect' : '→ Connect with Google'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {gmailConnected && (
          <div className="email-agent-panel glass-card">
            <div>
              <h2>Email summary agent</h2>
              <p>Review recent Gmail, summarize important messages, and mark scam-like emails as PawBot scam alerts.</p>
            </div>
            <button className="glass-btn primary" onClick={handleEmailSummary} disabled={summarizing}>
              {summarizing ? '⟳ Reviewing…' : 'Run Email Summary'}
            </button>
          </div>
        )}

        {emailSummary && (
          <div className="email-summary glass-card">
            <div className="es-head">
              <h2>Recent email summary</h2>
              <span>{emailSummary.importantCount} important · {emailSummary.scamCount} scam</span>
            </div>
            <p className="es-summary">{emailSummary.summary}</p>
            {!!emailSummary.scamAlerts?.length && (
              <div className="es-scams">
                {emailSummary.scamAlerts.map(alert => (
                  <div key={alert.id} className="es-scam">
                    <span>{alert.riskLevel}</span>
                    <p>{alert.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="info-panel glass-card">
          <span className="info-glyph">ℹ</span>
          <div>
            <p className="info-title">How Google integration works</p>
            <p className="info-body">
              Clicking "Connect" opens a Google authorization page via Hyperspell OAuth. After the senior (or caretaker)
              grants access, PawBot pulls upcoming calendar events for reminders and scans Gmail for potential scam
              patterns. Use "Sync All" to refresh on demand, or wait for the automatic 6-hour background cycle.
            </p>
          </div>
        </div>
      </div>
      <style>{`
        .int-page { max-width: 700px; }
        .page-header {
          display: flex; align-items: flex-start;
          justify-content: space-between; gap: 16px; margin-bottom: 28px;
        }
        .page-header h1 { font-size: 24px; margin-bottom: 5px; }
        .page-sub { font-size: 13.5px; color: var(--text-secondary); line-height: 1.5; }
        .provider-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
        .email-agent-panel {
          display: flex; justify-content: space-between; align-items: center; gap: 16px;
          padding: 18px 20px; margin-bottom: 14px;
        }
        .email-agent-panel h2, .email-summary h2 { font-size: 14px; margin-bottom: 5px; }
        .email-agent-panel p { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
        .email-summary { padding: 18px 20px; margin-bottom: 14px; }
        .es-head { display: flex; justify-content: space-between; gap: 14px; align-items: baseline; margin-bottom: 10px; }
        .es-head span { font-size: 12px; color: var(--text-tertiary); white-space: nowrap; }
        .es-summary { white-space: pre-wrap; font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
        .es-scams { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
        .es-scam { padding: 10px 12px; border: 1px solid rgba(255,71,87,0.25); border-radius: 8px; background: var(--danger-dim); }
        .es-scam span { display: block; color: var(--danger); font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
        .es-scam p { font-size: 12.5px; line-height: 1.45; color: var(--text-primary); }
        .provider-card {
          padding: 24px;
          display: flex; flex-direction: column; gap: 14px;
          transition: border-color var(--transition-base);
        }
        .provider-card.is-connected { border-color: rgba(46,213,115,0.22); }
        .pc-head { display: flex; align-items: center; gap: 13px; }
        .pc-icon-box {
          width: 46px; height: 46px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          flex-shrink: 0;
        }
        .pc-icon { font-size: 22px; }
        .pc-name { font-size: 15px; font-weight: 600; margin-bottom: 5px; }
        .pc-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.55; }
        .pc-synced { font-size: 11.5px; color: var(--text-tertiary); font-family: var(--font-mono); }
        .info-panel {
          display: flex; gap: 14px; align-items: flex-start;
          padding: 18px 20px;
          background: rgba(30,144,255,0.05);
          border-color: rgba(30,144,255,0.18);
        }
        .info-glyph { color: var(--info); font-size: 17px; flex-shrink: 0; margin-top: 2px; }
        .info-title { font-size: 13.5px; font-weight: 500; margin-bottom: 5px; }
        .info-body { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
        @media (max-width: 560px) {
          .provider-grid { grid-template-columns: 1fr; }
          .email-agent-panel { align-items: stretch; flex-direction: column; }
        }
      `}</style>
    </>
  )
}
