import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../App.jsx'
import { api } from '../api.js'
import { insforge } from '../insforge.js'
import StatusPill from '../components/StatusPill.jsx'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const LOG_ICON = {
  medication_reminder_sent:  '💊',
  medication_follow_up_sent: '📲',
  medication_marked_taken:   '✅',
  missed_medication_escalated: '🚨',
  scam_alert_created:        '🛡',
  unmatched_text_reply:      '💬',
  text_reply_received:       '📩',
}

export default function Overview() {
  const { seniorId, account } = useApp()
  const [medStatus, setMedStatus]     = useState(null)
  const [agentLogs, setAgentLogs]     = useState(null)
  const [events, setEvents]           = useState(null)
  const [scamAlerts, setScamAlerts]   = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [refreshKey, setRefreshKey]   = useState(0)

  const load = useCallback(async () => {
    if (!seniorId) return
    setLoading(true)
    setError(null)
    try {
      const [ms, logs, ev, sa] = await Promise.all([
        api(`/api/seniors/${seniorId}/medication-status/today`),
        api(`/api/seniors/${seniorId}/agent-logs`),
        api(`/api/seniors/${seniorId}/calendar-events/upcoming`),
        api(`/api/seniors/${seniorId}/scam-alerts`),
      ])
      setMedStatus(ms)
      setAgentLogs(logs.slice(0, 6))
      setEvents(ev)
      setScamAlerts(sa)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [seniorId])

  useEffect(() => { load() }, [load, refreshKey])

  // Real-time: refresh whenever the backend writes medication, scam, or agent events
  const channelRef = useRef(null)
  useEffect(() => {
    if (!seniorId) return
    let active = true

    insforge.realtime.connect().then(() => {
      return insforge.realtime.subscribe(`senior:${seniorId}`)
    }).then(({ channel }) => {
      if (!active) return
      channelRef.current = channel
      insforge.realtime.on(channel, () => {
        if (active) load()
      })
    }).catch(() => {
      // real-time unavailable — fall back to manual refresh
    })

    return () => {
      active = false
      if (channelRef.current) {
        insforge.realtime.disconnect()
        channelRef.current = null
      }
    }
  }, [seniorId, load])

  if (!seniorId) return (
    <div className="not-configured">
      <span>⚙️</span>
      <p>Use the gear icon to configure a Senior ID.</p>
    </div>
  )

  const taken = medStatus?.filter(d => d.status === 'taken').length ?? 0
  const total = medStatus?.length ?? 0
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <>
      <div className="overview fade-in">
        <div className="ov-header">
          <div>
            <h1 className="ov-greeting">{greeting()}, {account?.name ?? 'there'}</h1>
            <p className="ov-date">{today}</p>
          </div>
          <button
            className="glass-btn"
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            style={{ flexShrink: 0 }}
          >
            <span style={{ display: 'inline-block', transition: 'transform 0.4s', transform: loading ? 'rotate(360deg)' : 'none' }}>↻</span>
            Refresh
          </button>
        </div>

        {error && <div className="error-bar">⚠ {error}</div>}

        <div className="stat-row stagger">
          <StatCard
            icon="💊" label="Medications Today"
            value={loading ? '—' : `${taken} / ${total}`}
            sub={loading ? '' : (taken === total && total > 0 ? 'All confirmed ✓' : `${total - taken} remaining`)}
            accent="var(--accent)"
          />
          <StatCard
            icon="📅" label="Upcoming Events"
            value={loading ? '—' : (events?.length ?? '—')}
            sub={events?.[0]?.title ?? 'No upcoming events'}
            accent="var(--info)"
          />
          <StatCard
            icon="🛡" label="Scam Alerts"
            value={loading ? '—' : (scamAlerts?.length ?? '—')}
            sub={scamAlerts?.length ? `${scamAlerts[0].riskLevel} risk` : 'All clear'}
            accent={scamAlerts?.length ? 'var(--danger)' : 'var(--success)'}
          />
        </div>

        <div className="ov-grid">
          <section className="glass-card ov-section">
            <h3 className="section-heading">Today's Medications</h3>
            {loading ? (
              <SkeletonList n={3} h={52} />
            ) : !medStatus?.length ? (
              <Empty msg="No medications scheduled today." />
            ) : (
              <div className="med-list">
                {medStatus.map((dose, i) => (
                  <div key={i} className="dose-row">
                    <div className="dose-info">
                      <span className="dose-name">{dose.medicationName}</span>
                      <span className="dose-dosage">{dose.dosage}</span>
                    </div>
                    <div className="dose-right">
                      <span className="dose-time">{dose.time}</span>
                      <StatusPill status={dose.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="glass-card ov-section">
            <h3 className="section-heading">Agent Activity</h3>
            {loading ? (
              <SkeletonList n={5} h={40} />
            ) : !agentLogs?.length ? (
              <Empty msg="No agent activity yet." />
            ) : (
              <div className="log-list">
                {agentLogs.map(log => (
                  <div key={log.id} className="log-row">
                    <span className="log-icon">
                      {LOG_ICON[log.agentAction] ?? '🤖'}
                    </span>
                    <div className="log-body">
                      <span className="log-action">
                        {log.agentAction.replace(/_/g, ' ')}
                      </span>
                      <span className="log-time">{timeAgo(log.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {events?.length > 0 && (
          <section className="glass-card ov-section" style={{ marginTop: 16 }}>
            <h3 className="section-heading">Upcoming Events</h3>
            <div className="event-list">
              {events.slice(0, 4).map(ev => (
                <div key={ev.id} className="event-row">
                  <span className="event-type-dot" />
                  <div className="event-info">
                    <span className="event-title">{ev.title}</span>
                    <span className="event-date">
                      {new Date(ev.date).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <style>{`
        .overview { max-width: 1080px; }
        .ov-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 28px;
        }
        .ov-greeting {
          font-size: 27px;
          font-weight: 700;
          margin-bottom: 5px;
        }
        .ov-date { font-size: 13.5px; color: var(--text-secondary); }
        .stat-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          margin-bottom: 16px;
        }
        .ov-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .ov-section { padding: 22px; }
        .section-heading {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.9px;
          color: var(--text-secondary);
          margin-bottom: 14px;
        }
        .med-list { display: flex; flex-direction: column; gap: 7px; }
        .dose-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 11px 13px;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border);
          border-radius: 10px;
        }
        .dose-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .dose-name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dose-dosage { font-size: 12px; color: var(--text-secondary); }
        .dose-right { display: flex; align-items: center; gap: 9px; flex-shrink: 0; }
        .dose-time { font-family: var(--font-mono); font-size: 12.5px; color: var(--text-secondary); }
        .log-list { display: flex; flex-direction: column; gap: 4px; }
        .log-row {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 9px 10px;
          border-radius: 8px;
          transition: background var(--transition-fast);
        }
        .log-row:hover { background: rgba(255,255,255,0.03); }
        .log-icon { font-size: 15px; flex-shrink: 0; }
        .log-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .log-action { font-size: 13px; color: var(--text-primary); text-transform: capitalize; }
        .log-time { font-size: 11.5px; color: var(--text-tertiary); }
        .event-list { display: flex; flex-direction: column; gap: 8px; }
        .event-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); }
        .event-row:last-child { border-bottom: none; }
        .event-type-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
        .event-info { display: flex; justify-content: space-between; align-items: center; flex: 1; gap: 12px; }
        .event-title { font-size: 14px; font-weight: 500; }
        .event-date { font-size: 12px; color: var(--text-secondary); white-space: nowrap; }
        .error-bar {
          padding: 11px 15px;
          background: var(--danger-dim);
          border: 1px solid rgba(255,71,87,0.25);
          border-radius: var(--radius-md);
          color: var(--danger);
          font-size: 13.5px;
          margin-bottom: 18px;
        }
        .not-configured {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; height: 50vh; gap: 12px;
          color: var(--text-secondary); font-size: 15px;
        }
        .not-configured span { font-size: 42px; }
        @media (max-width: 860px) {
          .stat-row { grid-template-columns: 1fr; }
          .ov-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  )
}

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <>
      <div className="stat-card glass-card">
        <div className="sc-top">
          <span className="sc-icon">{icon}</span>
          <span className="sc-label">{label}</span>
        </div>
        <div className="sc-value" style={{ color: accent }}>{value}</div>
        <div className="sc-sub">{sub}</div>
      </div>
      <style>{`
        .stat-card { padding: 20px; }
        .sc-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .sc-icon { font-size: 17px; }
        .sc-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary); }
        .sc-value { font-family: var(--font-display); font-size: 33px; font-weight: 700; line-height: 1; margin-bottom: 6px; }
        .sc-sub { font-size: 12.5px; color: var(--text-secondary); }
      `}</style>
    </>
  )
}

function SkeletonList({ n, h }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: h, borderRadius: 10 }} />
      ))}
    </div>
  )
}

function Empty({ msg }) {
  return <p style={{ fontSize: 13.5, color: 'var(--text-tertiary)', padding: '4px 0' }}>{msg}</p>
}
