import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../App.jsx'
import { api } from '../api.js'
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

export default function AlertsMemory() {
  const { seniorId, toast } = useApp()
  const [alerts, setAlerts]             = useState([])
  const [alertsLoading, setAlertsLoading] = useState(true)
  const [query, setQuery]               = useState('')
  const [results, setResults]           = useState(null)
  const [searching, setSearching]       = useState(false)

  const fetchAlerts = useCallback(async () => {
    if (!seniorId) return
    setAlertsLoading(true)
    try {
      setAlerts(await api(`/api/seniors/${seniorId}/scam-alerts`))
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setAlertsLoading(false)
    }
  }, [seniorId, toast])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setResults(null)
    try {
      const data = await api(
        `/api/seniors/${seniorId}/memory/search?q=${encodeURIComponent(query)}`
      )
      setResults(Array.isArray(data.results) ? data.results : [])
    } catch (e) {
      toast(e.message, 'error')
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  const renderMemoryItem = (item, i) => {
    if (typeof item === 'string') {
      return <p className="mem-text">{item}</p>
    }
    const content = item.content ?? item.text ?? item.body ?? item
    return (
      <>
        {item.type && <span className="mem-type">{item.type}</span>}
        <p className="mem-text">
          {typeof content === 'string' ? content : JSON.stringify(content, null, 2)}
        </p>
        {item.createdAt && <span className="mem-ts">{timeAgo(item.createdAt)}</span>}
      </>
    )
  }

  if (!seniorId) return (
    <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
      Configure a Senior ID using the gear icon.
    </p>
  )

  return (
    <>
      <div className="am-page fade-in">
        <div className="page-header">
          <h1>Alerts &amp; Memory</h1>
        </div>
        <div className="two-col">
          <section>
            <div className="col-header">
              <h2>Scam Alerts</h2>
              <button className="glass-btn" onClick={fetchAlerts} disabled={alertsLoading} title="Refresh">↻</button>
            </div>

            {alertsLoading ? (
              <SkeletonList n={3} h={96} />
            ) : !alerts.length ? (
              <PanelEmpty icon="🛡" msg="No scam alerts — all clear." />
            ) : (
              <div className="alert-list stagger">
                {alerts.map(alert => (
                  <div key={alert.id} className="alert-card glass-card">
                    <div className="ac-row">
                      <StatusPill status={alert.riskLevel} />
                      <span className="ac-source">{alert.source}</span>
                      <span className="ac-ts">{timeAgo(alert.createdAt)}</span>
                    </div>
                    <p className="ac-summary">{alert.summary}</p>
                    {alert.actionTaken && alert.actionTaken !== 'logged' && (
                      <p className="ac-action">Action: {alert.actionTaken}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="col-header">
              <h2>Agent Memory</h2>
            </div>

            <form className="search-form" onSubmit={handleSearch}>
              <input
                className="glass-input"
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={'Search memory… e.g. "missed medications"'}
              />
              <button
                type="submit"
                className="glass-btn primary"
                disabled={searching || !query.trim()}
              >
                {searching ? '⟳' : 'Search'}
              </button>
            </form>

            {searching && (
              <div style={{ marginTop: 16 }}>
                <SkeletonList n={3} h={72} />
              </div>
            )}

            {!searching && results === null && (
              <PanelEmpty icon="🧠" msg={'Search the senior\'s agent memory. Try "medication", "scam", or "calendar".'} faint />
            )}

            {!searching && results?.length === 0 && (
              <PanelEmpty icon="🔍" msg={`No memory found for "${query}".`} />
            )}

            {!searching && results?.length > 0 && (
              <div className="results-list stagger" style={{ marginTop: 16 }}>
                {results.map((item, i) => (
                  <div key={i} className="mem-card glass-card">
                    {renderMemoryItem(item, i)}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <style>{`
        .am-page { max-width: 1100px; }
        .page-header { margin-bottom: 24px; }
        .page-header h1 { font-size: 24px; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
        .col-header {
          display: flex; align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .col-header h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: var(--text-secondary); }
        .alert-list { display: flex; flex-direction: column; gap: 9px; }
        .alert-card { padding: 15px 17px; }
        .ac-row {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 8px; flex-wrap: wrap;
        }
        .ac-source { flex: 1; font-size: 13px; color: var(--text-secondary); min-width: 60px; }
        .ac-ts { font-size: 11.5px; color: var(--text-tertiary); white-space: nowrap; }
        .ac-summary { font-size: 13.5px; color: var(--text-primary); line-height: 1.5; margin-bottom: 6px; }
        .ac-action { font-size: 12px; color: var(--text-tertiary); text-transform: capitalize; }
        .search-form { display: flex; gap: 8px; margin-bottom: 0; }
        .search-form .glass-input { flex: 1; }
        .results-list { display: flex; flex-direction: column; gap: 9px; }
        .mem-card { padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
        .mem-type { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent); }
        .mem-text { font-size: 13.5px; color: var(--text-primary); line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
        .mem-ts { font-size: 11px; color: var(--text-tertiary); }
        @media (max-width: 800px) { .two-col { grid-template-columns: 1fr; } }
      `}</style>
    </>
  )
}

function SkeletonList({ n, h }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: h, borderRadius: 12 }} />
      ))}
    </div>
  )
}

function PanelEmpty({ icon, msg, faint }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 10,
      padding: '44px 20px',
      color: faint ? 'var(--text-tertiary)' : 'var(--text-secondary)',
      fontSize: 13.5,
      textAlign: 'center',
    }}>
      <span style={{ fontSize: 30 }}>{icon}</span>
      <p style={{ lineHeight: 1.5, maxWidth: 260 }}>{msg}</p>
    </div>
  )
}
