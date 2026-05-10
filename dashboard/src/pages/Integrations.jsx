import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../App.jsx'
import { api } from '../api.js'
import StatusPill from '../components/StatusPill.jsx'

const PROVIDERS = [
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    icon: '📅',
    desc: 'Read upcoming appointments, events, and holidays from Google Calendar.',
  },
  {
    id: 'google_mail',
    name: 'Gmail',
    icon: '📧',
    desc: 'Read recent Gmail and generate a morning brief.',
  },
]

export default function Integrations() {
  const { seniorId, toast } = useApp()
  const [calendarStatus, setCalendarStatus] = useState('unknown')
  const [calendarEvents, setCalendarEvents] = useState([])
  const [gmailStatus, setGmailStatus]   = useState('unknown')
  const [gmailMessages, setGmailMessages] = useState([])
  const [loading, setLoading]           = useState(true)
  const [syncing, setSyncing]           = useState(false)
  const [summarizing, setSummarizing]   = useState(false)
  const [emailSummary, setEmailSummary] = useState(null)
  const [personalInfo, setPersonalInfo] = useState(null)
  const [personalEmail, setPersonalEmail] = useState('')
  const [personalPassword, setPersonalPassword] = useState('')
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [connecting, setConnecting]     = useState({})
  const refreshTimer = useRef(null)

  const fetchConnections = useCallback(async (showError = true, showLoading = true) => {
    if (!seniorId) return
    if (showLoading) setLoading(true)
    try {
      const [calendar, gmail, info] = await Promise.all([
        api('/api/calendar/upcoming?limit=8')
          .then(events => ({ ok: true, events }))
          .catch(error => ({ ok: false, error })),
        api('/api/gmail/recent?limit=5')
          .then(messages => ({ ok: true, messages }))
          .catch(error => ({ ok: false, error })),
        api(`/api/seniors/${seniorId}/personal-info`).catch(() => ({ personalInfo: null })),
      ])
      setPersonalInfo(info.personalInfo)
      setPersonalEmail(info.personalInfo?.email ?? '')
      if (calendar.ok) {
        setCalendarEvents(calendar.events)
        setCalendarStatus('connected')
      } else {
        setCalendarEvents([])
        setCalendarStatus('unavailable')
      }
      if (gmail.ok) {
        setGmailMessages(gmail.messages)
        setGmailStatus('connected')
      } else {
        setGmailMessages([])
        setGmailStatus('unavailable')
      }
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
    if (providerId === 'google_calendar') {
      setConnecting(prev => ({ ...prev, [providerId]: true }))
      try {
        const events = await api('/api/calendar/upcoming?limit=8')
        setCalendarEvents(events)
        setCalendarStatus('connected')
        toast(`Google Calendar returned ${events.length} upcoming event${events.length === 1 ? '' : 's'}.`)
      } catch (e) {
        setCalendarStatus('unavailable')
        toast(e.message, 'error')
      } finally {
        setConnecting(prev => ({ ...prev, [providerId]: false }))
      }
      return
    }

    if (providerId === 'google_mail') {
      setConnecting(prev => ({ ...prev, [providerId]: true }))
      try {
        const messages = await api('/api/gmail/recent?limit=5')
        setGmailMessages(messages)
        setGmailStatus('connected')
        toast(`Gmail returned ${messages.length} recent message${messages.length === 1 ? '' : 's'}.`)
      } catch (e) {
        setGmailStatus('unavailable')
        toast(e.message, 'error')
      } finally {
        setConnecting(prev => ({ ...prev, [providerId]: false }))
      }
      return
    }
  }

  const handlePersonalSave = async (event) => {
    event.preventDefault()
    setSavingPersonal(true)
    try {
      const body = { email: personalEmail }
      if (personalPassword) body.password = personalPassword
      const res = await api(`/api/seniors/${seniorId}/personal-info`, {
        method: 'PUT',
        body,
      })
      setPersonalInfo(res.personalInfo)
      setPersonalEmail(res.personalInfo?.email ?? personalEmail)
      setPersonalPassword('')
      toast('Senior personal info saved for agents.')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSavingPersonal(false)
    }
  }

  const handleSyncAll = async () => {
    setSyncing(true)
    try {
      const [events, messages] = await Promise.all([
        api('/api/calendar/upcoming?limit=8').catch(() => calendarEvents),
        api('/api/gmail/recent?limit=5').catch(() => gmailMessages),
      ])
      setCalendarEvents(events)
      setCalendarStatus(Array.isArray(events) ? 'connected' : calendarStatus)
      setGmailMessages(messages)
      setGmailStatus(Array.isArray(messages) ? 'connected' : gmailStatus)
      toast(`Checked ${Array.isArray(events) ? events.length : 0} calendar event${Array.isArray(events) && events.length === 1 ? '' : 's'} · ${Array.isArray(messages) ? messages.length : 0} Gmail message${Array.isArray(messages) && messages.length === 1 ? '' : 's'}.`)
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
      const res = await api('/api/morning-brief?force=true')
      setEmailSummary(res)
      const messages = await api('/api/gmail/recent?limit=5').catch(() => gmailMessages)
      setGmailMessages(messages)
      setGmailStatus('connected')
      toast(`Morning brief generated from ${res.emailsCount ?? messages.length ?? 0} recent email${(res.emailsCount ?? messages.length) === 1 ? '' : 's'}.`)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSummarizing(false)
    }
  }

  const calendarConnected = calendarStatus === 'connected'
  const anyConnected = calendarConnected || gmailStatus === 'connected'
  const gmailConnected = gmailStatus === 'connected'

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
              const providerConnected = p.id === 'google_calendar' ? calendarConnected : gmailConnected
              const busy = !!connecting[p.id]

              return (
                <div key={p.id} className={`provider-card glass-card${providerConnected ? ' is-connected' : ''}`}>
                  <div className="pc-head">
                    <div className="pc-icon-box">
                      <span className="pc-icon">{p.icon}</span>
                    </div>
                    <div>
                      <h3 className="pc-name">{p.name}</h3>
                      <StatusPill status={providerConnected ? 'connected' : 'disconnected'} />
                    </div>
                  </div>
                  <p className="pc-desc">{p.desc}</p>
                  {p.id === 'google_calendar' && providerConnected && (
                    <p className="pc-synced">
                      {calendarEvents.length} upcoming event{calendarEvents.length === 1 ? '' : 's'}
                      {calendarEvents.some(event => event.isHoliday) && ' including holidays'}
                    </p>
                  )}
                  {p.id === 'google_mail' && providerConnected && (
                    <p className="pc-synced">
                      {gmailMessages.length} recent message{gmailMessages.length === 1 ? '' : 's'}
                    </p>
                  )}
                  <button
                    className={`glass-btn${providerConnected ? '' : ' primary'}`}
                    onClick={() => handleConnect(p.id)}
                    disabled={busy}
                  >
                    {p.id === 'google_mail'
                      ? (busy ? '⟳ Checking…' : providerConnected ? '⟳ Check Gmail' : 'Check Gmail')
                      : (busy ? '⟳ Checking…' : providerConnected ? '⟳ Check Calendar' : 'Check Calendar')}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {gmailConnected && (
          <div className="email-agent-panel glass-card">
            <div>
              <h2>Morning brief</h2>
              <p>Uses Gmail and Calendar, then writes the daily summary.</p>
            </div>
            <button className="glass-btn primary" onClick={handleEmailSummary} disabled={summarizing}>
              {summarizing ? '⟳ Generating…' : 'Generate Brief'}
            </button>
          </div>
        )}

        {emailSummary && (
          <div className="email-summary glass-card">
            <div className="es-head">
              <h2>Morning brief</h2>
              <span>{emailSummary.emailsCount ?? gmailMessages.length} emails · {emailSummary.eventsCount ?? 0} events</span>
            </div>
            <p className="es-summary">{emailSummary.brief}</p>
          </div>
        )}

        <form className="personal-info glass-card" onSubmit={handlePersonalSave}>
          <div className="pi-head">
            <div>
              <h2>Senior Personal Info</h2>
              <p>Email and password saved here are available to backend agents through the agent personal-info endpoint.</p>
            </div>
            {personalInfo?.updatedAt && (
              <span>Updated {new Date(personalInfo.updatedAt).toLocaleString()}</span>
            )}
          </div>
          <div className="pi-grid">
            <label className="pi-label">
              <span className="field-label">Email</span>
              <input
                className="glass-input"
                type="email"
                value={personalEmail}
                onChange={e => setPersonalEmail(e.target.value)}
                placeholder="senior@example.com"
                required
              />
            </label>
            <label className="pi-label">
              <span className="field-label">Password</span>
              <input
                className="glass-input"
                type="password"
                value={personalPassword}
                onChange={e => setPersonalPassword(e.target.value)}
                placeholder={personalInfo?.hasPassword ? 'Saved password unchanged' : 'Enter password'}
              />
            </label>
          </div>
          <div className="pi-actions">
            <span>{personalInfo?.hasPassword ? 'Password saved for agent use.' : 'No password saved yet.'}</span>
            <button className="glass-btn primary" type="submit" disabled={savingPersonal}>
              {savingPersonal ? 'Saving…' : 'Save Info'}
            </button>
          </div>
        </form>

        <div className="info-panel glass-card">
          <span className="info-glyph">ℹ</span>
          <div>
            <p className="info-title">How Google integration works</p>
            <p className="info-body">
              Google Calendar and Gmail are checked from the connected backend account. The dashboard pulls upcoming
              events, holidays, and recent emails, then writes the morning brief.
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
        .personal-info { padding: 18px 20px; margin-bottom: 14px; }
        .pi-head {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 14px; margin-bottom: 15px;
        }
        .pi-head h2 { font-size: 14px; margin-bottom: 5px; }
        .pi-head p { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
        .pi-head span { font-size: 11.5px; color: var(--text-tertiary); white-space: nowrap; }
        .pi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
        .pi-label { display: flex; flex-direction: column; gap: 5px; }
        .pi-actions {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap;
        }
        .pi-actions span { font-size: 12px; color: var(--text-tertiary); }
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
          .pi-grid { grid-template-columns: 1fr; }
          .pi-head { flex-direction: column; }
        }
      `}</style>
    </>
  )
}
