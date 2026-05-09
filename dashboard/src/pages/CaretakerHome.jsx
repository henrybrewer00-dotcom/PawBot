import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../App.jsx'
import { api } from '../api.js'
import StatusPill from '../components/StatusPill.jsx'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const LOG_ICON = {
  medication_reminder_sent:    '💊',
  medication_follow_up_sent:   '📲',
  medication_marked_taken:     '✅',
  missed_medication_escalated: '🚨',
  scam_alert_created:          '🛡',
  unmatched_text_reply:        '💬',
  text_reply_received:         '📩',
}

function initials(name) {
  return (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function CaretakerHome() {
  const { profile, toast, account } = useApp()
  const [seniors, setSeniors] = useState(profile?.seniors ?? [])
  const [selectedId, setSelectedId] = useState(profile?.seniors?.[0]?.id ?? null)
  const [showAddSenior, setShowAddSenior] = useState(false)
  const [showLinkSenior, setShowLinkSenior] = useState(false)

  const selectedSenior = seniors.find(s => s.id === selectedId) ?? null

  useEffect(() => {
    const nextSeniors = profile?.seniors ?? []
    setSeniors(nextSeniors)
    setSelectedId((currentSelectedId) => {
      if (currentSelectedId && nextSeniors.some((senior) => senior.id === currentSelectedId)) {
        return currentSelectedId
      }
      return nextSeniors[0]?.id ?? null
    })
  }, [profile?.seniors])

  const onSeniorAdded = (newSenior) => {
    setSeniors(prev => {
      const next = prev.filter((senior) => senior.id !== newSenior.id)
      return [...next, newSenior]
    })
    setSelectedId(newSenior.id)
    setShowAddSenior(false)
    toast(`${newSenior.name} added`)
  }

  return (
    <>
      <div className="ct-page fade-in">
        <div className="ct-header">
          <div>
            <h1 className="ct-title">My Seniors</h1>
            <p className="ct-subtitle">
              {seniors.length === 0
                ? 'No seniors added yet'
                : `${seniors.length} ${seniors.length === 1 ? 'person' : 'people'} under your care`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="glass-btn" onClick={() => setShowLinkSenior(true)}>
              Link Existing
            </button>
            <button className="glass-btn primary" onClick={() => setShowAddSenior(true)}>
              + Add Senior
            </button>
          </div>
        </div>

        {seniors.length === 0 ? (
          <div className="ct-empty">
            <span>👥</span>
            <p>Add a senior to begin monitoring their care.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="glass-btn" onClick={() => setShowLinkSenior(true)}>
                Link Existing
              </button>
              <button className="glass-btn primary" onClick={() => setShowAddSenior(true)}>
                + Add your first senior
              </button>
            </div>
          </div>
        ) : (
          <div className="ct-roster stagger">
            {seniors.map(s => (
              <SeniorCard
                key={s.id}
                senior={s}
                selected={s.id === selectedId}
                onClick={() => {
                  setSelectedId(s.id)
                }}
              />
            ))}
            <button className="add-roster-btn" onClick={() => setShowAddSenior(true)}>
              <span className="arb-plus">+</span>
              <span>Add Senior</span>
            </button>
          </div>
        )}

        {selectedSenior && (
          <SeniorDetail
            key={selectedSenior.id}
            senior={selectedSenior}
            caretakerId={account.id}
            toast={toast}
          />
        )}
      </div>

      {showAddSenior && (
        <AddSeniorModal
          onAdded={onSeniorAdded}
          onClose={() => setShowAddSenior(false)}
        />
      )}

      {showLinkSenior && (
        <LinkSeniorModal
          onLinked={onSeniorAdded}
          onClose={() => setShowLinkSenior(false)}
        />
      )}

      <style>{`
        .ct-page { max-width: 1100px; }
        .ct-header {
          display: flex; align-items: flex-start;
          justify-content: space-between; gap: 16px;
          margin-bottom: 28px;
        }
        .ct-title { font-size: 26px; font-weight: 700; margin-bottom: 4px; }
        .ct-subtitle { font-size: 13px; color: var(--text-secondary); }
        .ct-empty {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 16px;
          padding: 64px 24px; text-align: center;
          color: var(--text-secondary); font-size: 15px;
        }
        .ct-empty span { font-size: 46px; }
        .ct-roster {
          display: flex; flex-wrap: wrap; gap: 12px;
          margin-bottom: 28px;
        }
        .add-roster-btn {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 8px;
          width: 130px; min-height: 118px;
          background: transparent;
          border: 2px dashed var(--border);
          border-radius: 16px;
          color: var(--text-tertiary); font-size: 13px;
          cursor: pointer;
          transition: all var(--transition-fast);
          font-family: var(--font-body);
        }
        .arb-plus { font-size: 22px; line-height: 1; }
        .add-roster-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-dim);
        }
      `}</style>
    </>
  )
}

/* ─── Senior roster card ─────────────────────────────────────── */

function SeniorCard({ senior, selected, onClick }) {
  return (
    <>
      <button className={`sc-btn${selected ? ' sc-selected' : ''}`} onClick={onClick}>
        <div className="sc-av">{initials(senior.name)}</div>
        <div className="sc-name">{senior.name}</div>
        <div className="sc-phone">{senior.phone ?? '—'}</div>
      </button>
      <style>{`
        .sc-btn {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; padding: 18px 14px;
          width: 130px;
          background: #ffffff;
          border: 1.5px solid var(--border);
          border-radius: 16px;
          cursor: pointer; text-align: center;
          transition: all var(--transition-fast);
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          font-family: var(--font-body);
        }
        .sc-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 14px rgba(0,0,0,0.10);
          border-color: var(--accent);
        }
        .sc-selected {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 3px var(--accent-dim), 0 4px 14px rgba(0,0,0,0.10) !important;
        }
        .sc-av {
          width: 44px; height: 44px; border-radius: 50%;
          background: var(--accent-dim);
          border: 2px solid var(--border-accent);
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; font-weight: 700; color: var(--accent);
          font-family: var(--font-display);
        }
        .sc-selected .sc-av {
          background: var(--accent);
          color: #ffffff;
          border-color: transparent;
        }
        .sc-name {
          font-size: 13px; font-weight: 600; color: var(--text-primary);
          max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sc-phone {
          font-size: 11px; color: var(--text-tertiary);
          font-family: var(--font-mono);
        }
      `}</style>
    </>
  )
}

/* ─── Senior detail panel ────────────────────────────────────── */

const TABS = [
  { id: 'overview',  label: 'Overview',      icon: '⌂'  },
  { id: 'calendar',  label: 'Calendar',      icon: '📅' },
  { id: 'summary',   label: 'Email Summary', icon: '📧' },
]

function SeniorDetail({ senior, caretakerId, toast }) {
  const [tab, setTab] = useState('overview')

  const copyId = () => {
    navigator.clipboard.writeText(senior.id)
    toast('Senior ID copied')
  }

  return (
    <>
      <div className="sd-card glass-card fade-in">
        {/* Header */}
        <div className="sd-head">
          <div className="sd-identity">
            <div className="sd-big-av">{initials(senior.name)}</div>
            <div>
              <div className="sd-full-name">{senior.name}</div>
              <div className="sd-phone-row">{senior.phone ?? 'No phone on file'}</div>
            </div>
            <button className="sd-id-chip" onClick={copyId} title="Copy senior ID">
              <span className="chip-lbl">ID</span>
              <span className="chip-val">{senior.id.slice(0, 18)}…</span>
              <span className="chip-copy">⎘</span>
            </button>
          </div>
          <nav className="sd-tabs">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`sd-tab${tab === t.id ? ' sd-tab-active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="sd-body">
          {tab === 'overview'  && <OverviewTab     seniorId={senior.id} caretakerId={caretakerId} toast={toast} />}
          {tab === 'calendar'  && <CalendarTab     seniorId={senior.id} caretakerId={caretakerId} toast={toast} />}
          {tab === 'summary'   && <EmailSummaryTab seniorId={senior.id} toast={toast} />}
        </div>
      </div>
      <style>{`
        .sd-card { overflow: hidden; }
        .sd-head {
          padding: 22px 26px 0;
          border-bottom: 1px solid var(--border);
          background: rgba(0,0,0,0.015);
        }
        .sd-identity {
          display: flex; align-items: center; gap: 14px;
          flex-wrap: wrap; margin-bottom: 18px;
        }
        .sd-big-av {
          width: 48px; height: 48px; border-radius: 50%;
          background: linear-gradient(135deg, var(--accent), #7c3aed);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 700; color: #ffffff;
          font-family: var(--font-display); flex-shrink: 0;
        }
        .sd-full-name { font-size: 17px; font-weight: 700; margin-bottom: 3px; }
        .sd-phone-row {
          font-size: 13px; color: var(--text-secondary);
          font-family: var(--font-mono);
        }
        .sd-id-chip {
          margin-left: auto; display: flex; align-items: center; gap: 7px;
          padding: 6px 12px; border-radius: 20px;
          background: rgba(0,0,0,0.04); border: 1px solid var(--border);
          cursor: pointer; transition: all var(--transition-fast);
          font-family: var(--font-body);
        }
        .sd-id-chip:hover { background: var(--accent-dim); border-color: var(--border-accent); }
        .chip-lbl {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.6px; color: var(--text-tertiary);
        }
        .chip-val { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary); }
        .chip-copy { font-size: 14px; color: var(--text-tertiary); }
        .sd-id-chip:hover .chip-copy { color: var(--accent); }
        .sd-tabs { display: flex; gap: 0; overflow-x: auto; }
        .sd-tab {
          display: flex; align-items: center; gap: 6px;
          padding: 10px 18px;
          background: none; border: none;
          border-bottom: 2.5px solid transparent;
          font-size: 13.5px; font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer; white-space: nowrap;
          transition: color var(--transition-fast), border-color var(--transition-fast);
          font-family: var(--font-body);
        }
        .sd-tab:hover { color: var(--text-primary); }
        .sd-tab-active { color: var(--accent); border-bottom-color: var(--accent); }
        .sd-body { padding: 26px; }
      `}</style>
    </>
  )
}

/* ─── Tab: Overview ──────────────────────────────────────────── */

function OverviewTab({ seniorId, caretakerId, toast }) {
  const [medStatus, setMedStatus]   = useState(null)
  const [agentLogs, setAgentLogs]   = useState(null)
  const [scamAlerts, setScamAlerts] = useState(null)
  const [meds, setMeds]             = useState([])
  const [loading, setLoading]       = useState(true)

  // Add medication form state
  const [showAdd, setShowAdd]             = useState(false)
  const [saving, setSaving]               = useState(false)
  const [medName, setMedName]             = useState('')
  const [medDosage, setMedDosage]         = useState('')
  const [medInstructions, setMedInstructions] = useState('')
  const [medTimes, setMedTimes]           = useState([])
  const [medFrequency, setMedFrequency]   = useState('daily')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [ms, logs, sa, allMeds] = await Promise.all([
        api(`/api/seniors/${seniorId}/medication-status/today`),
        api(`/api/seniors/${seniorId}/agent-logs`),
        api(`/api/seniors/${seniorId}/scam-alerts`),
        api(`/api/seniors/${seniorId}/medications`),
      ])
      setMedStatus(ms)
      setAgentLogs(logs.slice(0, 6))
      setScamAlerts(sa)
      setMeds(allMeds)
    } catch (e) {
      toast?.(e.message, 'error')
    } finally { setLoading(false) }
  }, [seniorId, toast])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleToggle = async (med) => {
    try {
      const updated = await api(`/api/medications/${med.id}`, {
        method: 'PATCH', body: { active: !med.active },
      })
      setMeds(prev => prev.map(m => m.id === med.id ? updated : m))
      toast?.(`${med.name} ${updated.active ? 'activated' : 'deactivated'}`)
    } catch (e) { toast?.(e.message, 'error') }
  }

  const handleAddMed = async (e) => {
    e.preventDefault()
    if (!medTimes.length) { toast?.('Select at least one time', 'error'); return }
    setSaving(true)
    try {
      const med = await api('/api/medications', {
        method: 'POST',
        body: { seniorId, createdBy: caretakerId, name: medName, dosage: medDosage, instructions: medInstructions, times: medTimes, frequency: medFrequency },
      })
      setMeds(prev => [...prev, med])
      setShowAdd(false)
      setMedName(''); setMedDosage(''); setMedInstructions(''); setMedTimes([]); setMedFrequency('daily')
      toast?.(`${med.name} added`)
    } catch (e) { toast?.(e.message, 'error') }
    finally { setSaving(false) }
  }

  if (loading) return <TabSkeleton rows={4} />

  const taken = medStatus?.filter(d => d.status === 'taken').length ?? 0
  const total = medStatus?.length ?? 0
  const pct   = total > 0 ? Math.round((taken / total) * 100) : 0

  return (
    <>
      {/* Medication schedule — full width, top of overview */}
      <section className="ov-panel ov-meds-full">
        <div className="ov-meds-head">
          <div className="ov-panel-head" style={{ margin: 0 }}>
            <span>💊</span> Medication Schedule
            <span className="ov-meds-count">{meds.length}</span>
          </div>
          <button
            className="glass-btn primary"
            style={{ padding: '6px 14px', fontSize: 13 }}
            onClick={() => setShowAdd(v => !v)}
          >
            {showAdd ? '✕ Cancel' : '+ Add Medication'}
          </button>
        </div>

        {showAdd && (
          <form className="ov-add-form" onSubmit={handleAddMed}>
            <div className="ov-add-grid">
              <label className="ov-add-label">
                <span className="field-label">Name *</span>
                <input className="glass-input" value={medName} onChange={e => setMedName(e.target.value)} placeholder="e.g. Lisinopril" required autoFocus />
              </label>
              <label className="ov-add-label">
                <span className="field-label">Dosage *</span>
                <input className="glass-input" value={medDosage} onChange={e => setMedDosage(e.target.value)} placeholder="e.g. 10mg" required />
              </label>
              <label className="ov-add-label">
                <span className="field-label">Daily times *</span>
                <TimesPicker value={medTimes} onChange={setMedTimes} />
              </label>
              <label className="ov-add-label">
                <span className="field-label">Frequency</span>
                <select className="glass-input glass-select" value={medFrequency} onChange={e => setMedFrequency(e.target.value)}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="as-needed">As needed</option>
                </select>
              </label>
              <label className="ov-add-label span2">
                <span className="field-label">Instructions</span>
                <input className="glass-input" value={medInstructions} onChange={e => setMedInstructions(e.target.value)} placeholder="e.g. Take with food" />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="glass-btn primary" disabled={saving}>
                {saving ? 'Adding…' : 'Add to Schedule'}
              </button>
              <button type="button" className="glass-btn" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </form>
        )}

        {!meds.length ? (
          <div className="ov-meds-empty">
            <span>💊</span>
            <p>No medications scheduled yet.</p>
            <button className="glass-btn primary" onClick={() => setShowAdd(true)}>
              + Add first medication
            </button>
          </div>
        ) : (
          <div className="ov-med-list">
            {meds.map(med => (
              <div key={med.id} className={`ov-med-row${med.active ? '' : ' ov-med-inactive'}`}>
                <div className="ov-med-info">
                  <div className="ov-med-name-row">
                    <span className="ov-med-name">{med.name}</span>
                    <StatusPill status={med.active ? 'active' : 'inactive'} />
                  </div>
                  <div className="ov-med-meta">
                    <span className="ov-med-dosage">{med.dosage}</span>
                    {med.instructions && <span className="ov-med-notes">· {med.instructions}</span>}
                  </div>
                  <div className="ov-med-tags">
                    {med.times?.map((t, i) => <span key={i} className="time-chip">{t}</span>)}
                    <span className="freq-chip">{med.frequency}</span>
                  </div>
                </div>
                <button
                  className={`glass-btn ${med.active ? 'danger' : 'primary'}`}
                  style={{ flexShrink: 0, fontSize: 12.5, padding: '6px 12px' }}
                  onClick={() => handleToggle(med)}
                >
                  {med.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Today's compliance + activity — below medication schedule */}
      <div className="ov-grid">
        <section className="ov-panel">
          <div className="ov-panel-head">
            <span>📋</span> Today's Compliance
          </div>
          <div className="med-progress-bar">
            <div className="med-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="med-progress-label">
            {taken} / {total} taken{total > 0 && taken === total ? ' ✓' : ''}
          </p>
          {medStatus?.length ? (
            <div className="ov-dose-list">
              {medStatus.map((d, i) => (
                <div key={i} className="ov-dose-row">
                  <div className="ov-dose-info">
                    <span className="ov-dose-name">{d.medicationName}</span>
                    <span className="ov-dose-dosage">{d.dosage}</span>
                  </div>
                  <div className="ov-dose-right">
                    <span className="ov-dose-time">{d.time}</span>
                    <StatusPill status={d.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="tab-empty">No doses scheduled for today.</p>
          )}
        </section>

        <section className="ov-panel">
          <div className="ov-panel-head"><span>🤖</span> Recent Activity</div>
          {agentLogs?.length ? (
            <div className="ov-log-list">
              {agentLogs.map(log => (
                <div key={log.id} className="ov-log-row">
                  <span className="ov-log-icon">{LOG_ICON[log.agentAction] ?? '🤖'}</span>
                  <div className="ov-log-body">
                    <span className="ov-log-action">{log.agentAction.replace(/_/g, ' ')}</span>
                    <span className="ov-log-time">{timeAgo(log.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="tab-empty">No recent activity.</p>
          )}

          {scamAlerts?.length > 0 && (
            <>
              <div className="ov-panel-head" style={{ marginTop: 20 }}>
                <span>🛡</span> Scam Alerts
              </div>
              {scamAlerts.map(a => (
                <div key={a.id} className="scam-row">
                  <span className={`scam-badge scam-${a.riskLevel}`}>{a.riskLevel}</span>
                  <span className="scam-summary">{a.summary}</span>
                </div>
              ))}
            </>
          )}
        </section>
      </div>
      <style>{`
        .ov-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
        .ov-panel {
          background: rgba(0,0,0,0.02);
          border: 1px solid var(--border);
          border-radius: 12px; padding: 18px;
        }
        .ov-panel-head {
          display: flex; align-items: center; gap: 7px;
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.8px; color: var(--text-secondary);
          margin-bottom: 14px;
        }
        .med-progress-bar {
          height: 6px; background: rgba(0,0,0,0.07); border-radius: 10px;
          overflow: hidden; margin-bottom: 6px;
        }
        .med-progress-fill {
          height: 100%; background: var(--accent);
          border-radius: 10px; transition: width 0.5s ease;
        }
        .med-progress-label {
          font-size: 12.5px; color: var(--text-secondary); margin-bottom: 12px;
        }
        .ov-dose-list { display: flex; flex-direction: column; gap: 6px; }
        .ov-dose-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 9px 11px; gap: 12px;
          background: #ffffff; border: 1px solid var(--border); border-radius: 9px;
        }
        .ov-dose-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .ov-dose-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ov-dose-dosage { font-size: 11.5px; color: var(--text-secondary); }
        .ov-dose-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .ov-dose-time { font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); }
        .ov-log-list { display: flex; flex-direction: column; gap: 3px; }
        .ov-log-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 9px; border-radius: 8px;
          transition: background var(--transition-fast);
        }
        .ov-log-row:hover { background: rgba(0,0,0,0.03); }
        .ov-log-icon { font-size: 14px; flex-shrink: 0; }
        .ov-log-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .ov-log-action { font-size: 12.5px; color: var(--text-primary); text-transform: capitalize; }
        .ov-log-time { font-size: 11px; color: var(--text-tertiary); }
        .scam-row {
          display: flex; align-items: flex-start; gap: 9px;
          padding: 9px 11px; background: var(--danger-dim);
          border: 1px solid rgba(220,38,38,0.15); border-radius: 8px; margin-top: 6px;
        }
        .scam-badge {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.5px; padding: 3px 7px; border-radius: 4px;
          flex-shrink: 0;
        }
        .scam-high { background: var(--danger); color: #fff; }
        .scam-medium { background: var(--warning); color: #fff; }
        .scam-low { background: var(--info-dim); color: var(--info); }
        .scam-summary { font-size: 12.5px; color: var(--text-primary); line-height: 1.5; }
        .ov-meds-full { margin-top: 0; margin-bottom: 0; }
        .ov-meds-empty {
          display: flex; flex-direction: column; align-items: center;
          gap: 10px; padding: 28px 16px; text-align: center;
          color: var(--text-secondary); font-size: 14px;
        }
        .ov-meds-empty span { font-size: 28px; }
        .ov-meds-head {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          margin-bottom: 14px;
        }
        .ov-meds-count {
          display: inline-flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; border-radius: 50%;
          background: var(--accent-dim); color: var(--accent);
          font-size: 11px; font-weight: 700;
        }
        .ov-add-form {
          background: rgba(0,0,0,0.02); border: 1px solid var(--border);
          border-radius: 10px; padding: 16px; margin-bottom: 14px;
        }
        .ov-add-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; margin-bottom: 12px; }
        .ov-add-label { display: flex; flex-direction: column; gap: 5px; }
        .ov-add-label.span2 { grid-column: 1 / -1; }
        .ov-med-list { display: flex; flex-direction: column; gap: 7px; }
        .ov-med-row {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 12px 14px; background: #ffffff;
          border: 1px solid var(--border); border-radius: 10px;
          transition: opacity var(--transition-base);
        }
        .ov-med-inactive { opacity: 0.5; }
        .ov-med-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .ov-med-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .ov-med-name { font-size: 13.5px; font-weight: 600; }
        .ov-med-meta { display: flex; align-items: center; gap: 5px; }
        .ov-med-dosage { font-size: 12.5px; color: var(--accent); font-weight: 500; }
        .ov-med-notes { font-size: 12px; color: var(--text-secondary); }
        .ov-med-tags { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
        @media (max-width: 700px) { .ov-grid { grid-template-columns: 1fr; } .ov-add-grid { grid-template-columns: 1fr; } }
      `}</style>
    </>
  )
}

/* ─── Tab: Calendar ──────────────────────────────────────────── */

function CalendarTab({ seniorId, caretakerId, toast }) {
  const [events, setEvents]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle]     = useState('')
  const [date, setDate]       = useState('')
  const [saving, setSaving]   = useState(false)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    try { setEvents(await api(`/api/seniors/${seniorId}/calendar-events/upcoming`)) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }, [seniorId, toast])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  const addEvent = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api('/api/calendar-events', {
        method: 'POST',
        body: { seniorId, createdBy: caretakerId, title, date },
      })
      toast('Event added to calendar')
      setTitle(''); setDate(''); setShowForm(false)
      fetchEvents()
    } catch (err) { toast(err.message, 'error') }
    finally { setSaving(false) }
  }

  if (loading) return <TabSkeleton rows={3} />

  return (
    <>
      <div className="cal-wrap">
        <div className="cal-bar">
          <span className="cal-count">
            {events?.length ?? 0} upcoming event{events?.length !== 1 ? 's' : ''}
          </span>
          <button className="glass-btn primary" onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Cancel' : '+ Add Event'}
          </button>
        </div>

        {showForm && (
          <form className="cal-form glass-card" onSubmit={addEvent}>
            <h3 className="cal-form-title">New Calendar Event</h3>
            <div className="cal-form-grid">
              <label className="cal-label span2">
                <span className="field-label">Event Title *</span>
                <input
                  className="glass-input"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Doctor's appointment"
                  required
                  autoFocus
                />
              </label>
              <label className="cal-label">
                <span className="field-label">Date *</span>
                <input
                  className="glass-input"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                />
              </label>
            </div>
            <div className="cal-form-actions">
              <button type="submit" className="glass-btn primary" disabled={saving}>
                {saving ? 'Adding…' : 'Add to Calendar'}
              </button>
              <button type="button" className="glass-btn" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        )}

        {!events?.length ? (
          <div className="cal-empty">
            <span>📅</span>
            <p>No upcoming events. Add one above.</p>
          </div>
        ) : (
          <div className="cal-list">
            {events.map(ev => {
              const d = new Date(ev.date)
              const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              const isPast = d < new Date()
              return (
                <div key={ev.id} className={`cal-event${isPast ? ' cal-past' : ''}`}>
                  <div className="cal-date-badge">
                    <span className="cal-month">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                    <span className="cal-day">{d.getDate()}</span>
                  </div>
                  <div className="cal-event-info">
                    <span className="cal-event-title">{ev.title}</span>
                    <span className="cal-event-date">{label}</span>
                  </div>
                  {isPast && <span className="cal-past-badge">Past</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <style>{`
        .cal-wrap { display: flex; flex-direction: column; gap: 16px; }
        .cal-bar { display: flex; align-items: center; justify-content: space-between; }
        .cal-count { font-size: 13px; color: var(--text-secondary); }
        .cal-form { padding: 20px; }
        .cal-form-title { font-size: 14px; font-weight: 600; margin-bottom: 16px; }
        .cal-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .cal-label { display: flex; flex-direction: column; gap: 5px; }
        .cal-form-actions { display: flex; gap: 8px; }
        .cal-empty {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 10px; padding: 40px 20px;
          color: var(--text-tertiary); text-align: center;
        }
        .cal-empty span { font-size: 32px; }
        .cal-list { display: flex; flex-direction: column; gap: 8px; }
        .cal-event {
          display: flex; align-items: center; gap: 14px;
          padding: 12px 14px; background: #ffffff;
          border: 1px solid var(--border); border-radius: 12px;
          transition: box-shadow var(--transition-fast);
        }
        .cal-event:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
        .cal-past { opacity: 0.5; }
        .cal-date-badge {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          width: 44px; height: 44px; border-radius: 10px;
          background: var(--accent-dim); border: 1px solid var(--border-accent);
          flex-shrink: 0;
        }
        .cal-month { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--accent); }
        .cal-day { font-size: 17px; font-weight: 800; color: var(--accent); line-height: 1; }
        .cal-event-info { flex: 1; display: flex; flex-direction: column; gap: 3px; }
        .cal-event-title { font-size: 14px; font-weight: 600; }
        .cal-event-date { font-size: 12px; color: var(--text-secondary); }
        .cal-past-badge {
          font-size: 11px; padding: 3px 9px; border-radius: 20px;
          background: rgba(0,0,0,0.06); color: var(--text-tertiary);
        }
      `}</style>
    </>
  )
}

/* ─── Tab: Email Summary ─────────────────────────────────────── */

function EmailSummaryTab({ seniorId, toast }) {
  const [summary, setSummary]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [generated, setGenerated] = useState(null)

  const generate = async () => {
    setLoading(true)
    setSummary(null)
    try {
      const res = await api(`/api/seniors/${seniorId}/hyperspell/email-summary`, { method: 'POST' })
      setSummary(res.summary)
      setGenerated(new Date().toLocaleTimeString())
    } catch (err) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }

  return (
    <>
      <div className="es-wrap">
        <div className="es-intro glass-card">
          <div className="es-icon">📧</div>
          <div>
            <div className="es-intro-title">AI Email Summary</div>
            <div className="es-intro-sub">
              Scans the senior's Gmail inbox for scam attempts, important notices, and anything worth flagging.
            </div>
          </div>
          <button className="glass-btn primary" onClick={generate} disabled={loading} style={{ flexShrink: 0 }}>
            {loading ? 'Generating…' : summary ? 'Regenerate' : 'Generate Summary'}
          </button>
        </div>

        {loading && (
          <div className="es-loading">
            <div className="es-spinner" />
            <span>Scanning inbox with AI…</span>
          </div>
        )}

        {summary && !loading && (
          <div className="es-result glass-card">
            <div className="es-result-head">
              <span>✅ Summary generated</span>
              {generated && <span className="es-time">at {generated}</span>}
            </div>
            <div className="es-result-body">{summary}</div>
          </div>
        )}
      </div>
      <style>{`
        .es-wrap { display: flex; flex-direction: column; gap: 16px; }
        .es-intro {
          padding: 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
        }
        .es-icon { font-size: 32px; flex-shrink: 0; }
        .es-intro-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
        .es-intro-sub { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
        .es-loading {
          display: flex; align-items: center; gap: 12px;
          padding: 20px 0; color: var(--text-secondary); font-size: 14px;
        }
        .es-spinner {
          width: 18px; height: 18px; border-radius: 50%;
          border: 2.5px solid var(--border);
          border-top-color: var(--accent);
          animation: spin 0.75s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .es-result { padding: 20px; }
        .es-result-head {
          display: flex; align-items: center; justify-content: space-between;
          font-size: 12.5px; font-weight: 600; color: var(--success);
          margin-bottom: 14px; gap: 8px;
        }
        .es-time { font-size: 11.5px; color: var(--text-tertiary); font-weight: 400; }
        .es-result-body {
          font-size: 14px; color: var(--text-primary);
          line-height: 1.65; white-space: pre-wrap;
        }
      `}</style>
    </>
  )
}

/* ─── Times picker ───────────────────────────────────────────── */

function TimesPicker({ value, onChange }) {
  const [input, setInput] = useState('')

  const add = () => {
    if (!input || value.includes(input)) return
    onChange([...value, input].sort())
    setInput('')
  }

  const remove = (t) => onChange(value.filter(x => x !== t))

  return (
    <>
      <div className="tp-wrap">
        <div className="tp-chips">
          {value.map(t => (
            <span key={t} className="tp-chip">
              {formatTime(t)}
              <button type="button" className="tp-remove" onClick={() => remove(t)}>×</button>
            </span>
          ))}
          {!value.length && <span className="tp-placeholder">No times selected</span>}
        </div>
        <div className="tp-input-row">
          <input
            className="glass-input tp-input"
            type="time"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          />
          <button type="button" className="glass-btn primary tp-add-btn" onClick={add} disabled={!input}>
            + Add
          </button>
        </div>
      </div>
      <style>{`
        .tp-wrap { display: flex; flex-direction: column; gap: 8px; }
        .tp-chips {
          display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
          min-height: 34px;
        }
        .tp-placeholder { font-size: 13px; color: var(--text-tertiary); }
        .tp-chip {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 10px 4px 12px;
          background: var(--accent-dim); border: 1px solid var(--border-accent);
          border-radius: 20px;
          font-family: var(--font-mono); font-size: 13px; color: var(--accent);
          font-weight: 600;
        }
        .tp-remove {
          background: none; border: none; cursor: pointer;
          color: var(--accent); opacity: 0.6; font-size: 16px;
          line-height: 1; padding: 0; display: flex; align-items: center;
        }
        .tp-remove:hover { opacity: 1; }
        .tp-input-row { display: flex; gap: 8px; align-items: center; }
        .tp-input { flex: 1; }
        .tp-add-btn { white-space: nowrap; padding: 9px 14px; }
      `}</style>
    </>
  )
}

function formatTime(t) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

/* ─── Add senior modal ───────────────────────────────────────── */

function LinkSeniorModal({ onLinked, onClose }) {
  const [identifier, setIdentifier] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await api('/api/me/link-senior', {
        method: 'POST',
        body: { identifier: identifier.trim() },
      })
      if (!res.senior) throw new Error('Unable to link senior')
      onLinked(res.senior)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box glass-card-elevated" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">Link Existing Senior</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
          <p className="modal-desc">
            Paste the senior's email address or phone number. PawBot will find the account and link it to your caretaker account.
          </p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label className="modal-label">
              <span className="field-label">Email or Phone *</span>
              <input
                className="glass-input"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="margaret@example.com or +15550000001"
                required
                autoFocus
              />
            </label>

            {error && (
              <div className="modal-error">{error}</div>
            )}

            <div className="modal-actions">
              <button type="submit" className="glass-btn primary" disabled={saving || !identifier.trim()}>
                {saving ? 'Linking…' : 'Link Senior'}
              </button>
              <button type="button" className="glass-btn" onClick={onClose}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
      <style>{`
        .modal-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(15,17,23,0.25); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; padding: 24px;
          animation: fadeIn 0.15s ease;
        }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        .modal-box {
          width: 100%; max-width: 440px; padding: 32px; background: #ffffff;
          animation: slideUp 0.2s ease;
        }
        @keyframes slideUp { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }
        .modal-header {
          display: flex; align-items: center;
          justify-content: space-between; gap: 12px; margin-bottom: 16px;
        }
        .modal-title { font-size: 20px; font-weight: 700; }
        .modal-close {
          background: none; border: none; cursor: pointer;
          color: var(--text-secondary); font-size: 16px; padding: 4px;
          border-radius: 6px; transition: all var(--transition-fast);
        }
        .modal-close:hover { background: rgba(0,0,0,0.06); color: var(--text-primary); }
        .modal-desc {
          font-size: 13px; color: var(--text-secondary);
          line-height: 1.55; margin-bottom: 18px;
        }
        .modal-label { display: flex; flex-direction: column; gap: 6px; }
        .modal-actions { display: flex; gap: 8px; margin-top: 6px; }
        .modal-error {
          padding: 10px 13px; border-radius: 8px;
          background: var(--danger-dim); border: 1px solid rgba(220,38,38,0.2);
          color: var(--danger); font-size: 13px;
        }
      `}</style>
    </>
  )
}

function AddSeniorModal({ onAdded, onClose }) {
  const [email, setEmail]     = useState('')
  const [name, setName]       = useState('')
  const [phone, setPhone]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await api('/api/me/seniors', {
        method: 'POST',
        body: { name, phone, email },
      })
      const nextSenior = res.senior ?? res.profile?.seniors?.[0]
      if (!nextSenior) throw new Error('Unable to create senior')
      onAdded(nextSenior)
    } catch (err) {
      setError(err.message)
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box glass-card-elevated" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">Add a Senior</h2>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
          <p className="modal-desc">
            Add the senior by name, phone, and email. PawBot creates the senior profile and links it to your caretaker account automatically.
          </p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label className="modal-label">
              <span className="field-label">Full Name *</span>
              <input className="glass-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Margaret Johnson" required autoFocus />
            </label>
            <label className="modal-label">
              <span className="field-label">Phone Number *</span>
              <input className="glass-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+15550000001" required />
            </label>
            <label className="modal-label">
              <span className="field-label">Email Address *</span>
              <input className="glass-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="margaret@example.com" required />
            </label>

            {error && (
              <div className="modal-error">{error}</div>
            )}

            <div className="modal-actions">
              <button type="submit" className="glass-btn primary" disabled={saving}>
                {saving ? 'Adding…' : 'Add Senior'}
              </button>
              <button type="button" className="glass-btn" onClick={onClose}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
      <style>{`
        .modal-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(15,17,23,0.25); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; padding: 24px;
          animation: fadeIn 0.15s ease;
        }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        .modal-box {
          width: 100%; max-width: 440px; padding: 32px; background: #ffffff;
          animation: slideUp 0.2s ease;
        }
        @keyframes slideUp { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }
        .modal-header {
          display: flex; align-items: center;
          justify-content: space-between; gap: 12px; margin-bottom: 16px;
        }
        .modal-title { font-size: 20px; font-weight: 700; }
        .modal-close {
          background: none; border: none; cursor: pointer;
          color: var(--text-secondary); font-size: 16px; padding: 4px;
          border-radius: 6px; transition: all var(--transition-fast);
        }
        .modal-close:hover { background: rgba(0,0,0,0.06); color: var(--text-primary); }
        .modal-desc {
          font-size: 13px; color: var(--text-secondary);
          line-height: 1.55; margin-bottom: 18px;
        }
        .modal-label { display: flex; flex-direction: column; gap: 6px; }
        .modal-actions { display: flex; gap: 8px; margin-top: 6px; }
        .modal-error {
          padding: 10px 13px; border-radius: 8px;
          background: var(--danger-dim); border: 1px solid rgba(220,38,38,0.2);
          color: var(--danger); font-size: 13px;
        }
      `}</style>
    </>
  )
}

/* ─── Shared helpers ─────────────────────────────────────────── */

function TabSkeleton({ rows = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 48, borderRadius: 10 }} />
      ))}
    </div>
  )
}
