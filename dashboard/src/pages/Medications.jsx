import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../App.jsx'
import { api } from '../api.js'
import StatusPill from '../components/StatusPill.jsx'

export default function Medications() {
  const { seniorId, account, toast } = useApp()
  const [meds, setMeds]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [showAdd, setShowAdd]     = useState(false)

  const fetchMeds = useCallback(async () => {
    if (!seniorId) return
    setLoading(true)
    try {
      setMeds(await api(`/api/seniors/${seniorId}/medications`))
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [seniorId, toast])

  useEffect(() => { fetchMeds() }, [fetchMeds])

  const handleToggle = async (med) => {
    try {
      const updated = await api(`/api/medications/${med.id}`, {
        method: 'PATCH',
        body: { active: !med.active },
      })
      setMeds(prev => prev.map(m => m.id === med.id ? updated : m))
      toast(`${med.name} ${updated.active ? 'activated' : 'deactivated'}`)
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  const handleSaveEdit = async (med, changes) => {
    try {
      const updated = await api(`/api/medications/${med.id}`, {
        method: 'PATCH',
        body: changes,
      })
      setMeds(prev => prev.map(m => m.id === med.id ? updated : m))
      setEditingId(null)
      toast(`${updated.name} updated`)
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  const handleAdd = async (data) => {
    try {
      const med = await api('/api/medications', {
        method: 'POST',
        body: { seniorId, createdBy: account?.id ?? seniorId, ...data },
      })
      setMeds(prev => [...prev, med])
      setShowAdd(false)
      toast(`${med.name} added`)
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  if (!seniorId) return (
    <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
      Configure a Senior ID using the gear icon.
    </p>
  )

  return (
    <>
      <div className="meds-page fade-in">
        <div className="page-header">
          <h1>Medications</h1>
          <button
            className={`glass-btn ${showAdd ? '' : 'primary'}`}
            onClick={() => { setShowAdd(v => !v); setEditingId(null) }}
          >
            {showAdd ? '✕ Cancel' : '+ Add Medication'}
          </button>
        </div>

        {showAdd && (
          <AddMedForm
            onSubmit={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {loading ? (
          <div className="skel-list">
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 14 }} />)}
          </div>
        ) : !meds.length ? (
          <div className="empty-page">
            <span>💊</span>
            <p>No medications added yet.</p>
          </div>
        ) : (
          <div className="med-cards stagger">
            {meds.map(med =>
              editingId === med.id
                ? <EditCard key={med.id} med={med}
                    onSave={changes => handleSaveEdit(med, changes)}
                    onCancel={() => setEditingId(null)} />
                : <MedCard key={med.id} med={med}
                    onEdit={() => { setEditingId(med.id); setShowAdd(false) }}
                    onToggle={() => handleToggle(med)} />
            )}
          </div>
        )}
      </div>
      <style>{`
        .meds-page { max-width: 800px; }
        .page-header {
          display: flex; align-items: center;
          justify-content: space-between; margin-bottom: 24px;
        }
        .page-header h1 { font-size: 24px; }
        .med-cards { display: flex; flex-direction: column; gap: 10px; }
        .skel-list { display: flex; flex-direction: column; gap: 10px; }
        .empty-page {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 10px; height: 280px;
          color: var(--text-secondary); font-size: 14.5px;
        }
        .empty-page span { font-size: 38px; }
      `}</style>
    </>
  )
}

function MedCard({ med, onEdit, onToggle }) {
  return (
    <>
      <div className={`med-card glass-card${med.active ? '' : ' med-inactive'}`}>
        <div className="mc-body">
          <div className="mc-name-row">
            <span className="mc-name">{med.name}</span>
            <StatusPill status={med.active ? 'active' : 'inactive'} />
          </div>
          <div className="mc-meta">
            <span className="mc-dosage">{med.dosage}</span>
            {med.instructions && <span className="mc-notes">· {med.instructions}</span>}
          </div>
          <div className="mc-tags">
            {med.times?.map((t, i) => (
              <span key={i} className="time-chip">{t}</span>
            ))}
            <span className="freq-chip">{med.frequency}</span>
          </div>
        </div>
        <div className="mc-actions">
          <button className="glass-btn" onClick={onEdit} title="Edit">✏</button>
          <button
            className={`glass-btn ${med.active ? 'danger' : 'primary'}`}
            onClick={onToggle}
          >
            {med.active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
      <style>{`
        .med-card {
          padding: 18px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          transition: opacity var(--transition-base);
        }
        .med-inactive { opacity: 0.5; }
        .mc-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
        .mc-name-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
        .mc-name { font-size: 15px; font-weight: 600; }
        .mc-meta { display: flex; align-items: center; gap: 6px; }
        .mc-dosage { font-size: 13.5px; color: var(--accent); font-weight: 500; }
        .mc-notes { font-size: 12.5px; color: var(--text-secondary); }
        .mc-tags { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
        .time-chip {
          padding: 2px 9px;
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border);
          border-radius: 20px;
          font-family: var(--font-mono);
          font-size: 11.5px;
          color: var(--text-secondary);
        }
        .freq-chip {
          padding: 2px 9px;
          background: var(--accent-dim);
          border: 1px solid var(--border-accent);
          border-radius: 20px;
          font-size: 11px;
          color: var(--accent);
          text-transform: capitalize;
        }
        .mc-actions { display: flex; gap: 7px; flex-shrink: 0; }
      `}</style>
    </>
  )
}

function EditCard({ med, onSave, onCancel }) {
  const [name, setName]               = useState(med.name)
  const [dosage, setDosage]           = useState(med.dosage)
  const [instructions, setInstructions] = useState(med.instructions || '')

  const submit = (e) => {
    e.preventDefault()
    onSave({ name, dosage, instructions })
  }

  return (
    <>
      <form className="edit-card glass-card" onSubmit={submit}>
        <div className="ec-grid">
          <label>
            <span className="field-label">Name</span>
            <input className="glass-input" value={name} onChange={e => setName(e.target.value)} required />
          </label>
          <label>
            <span className="field-label">Dosage</span>
            <input className="glass-input" value={dosage} onChange={e => setDosage(e.target.value)} required />
          </label>
          <label className="span2">
            <span className="field-label">Instructions</span>
            <textarea className="glass-input glass-textarea" value={instructions} onChange={e => setInstructions(e.target.value)} rows={2} />
          </label>
        </div>
        <div className="ec-actions">
          <button type="submit" className="glass-btn primary">Save Changes</button>
          <button type="button" className="glass-btn" onClick={onCancel}>Cancel</button>
        </div>
      </form>
      <style>{`
        .edit-card { padding: 20px; }
        .ec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
        .ec-grid label { display: flex; flex-direction: column; gap: 6px; }
        .ec-grid .span2 { grid-column: 1 / -1; }
        .ec-actions { display: flex; gap: 8px; }
      `}</style>
    </>
  )
}

function AddMedForm({ onSubmit, onCancel }) {
  const [name, setName]               = useState('')
  const [dosage, setDosage]           = useState('')
  const [instructions, setInstructions] = useState('')
  const [times, setTimes]             = useState([])
  const [timeInput, setTimeInput]     = useState('')
  const [frequency, setFrequency]     = useState('daily')
  const inputRef                      = useRef(null)

  const pushTime = () => {
    const t = timeInput.trim()
    if (t && /^\d{1,2}:\d{2}$/.test(t) && !times.includes(t)) {
      const padded = t.length === 4 ? '0' + t : t
      setTimes(prev => [...prev, padded].sort())
      setTimeInput('')
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); pushTime() }
    if (e.key === 'Backspace' && !timeInput && times.length) {
      setTimes(prev => prev.slice(0, -1))
    }
  }

  const removeTime = (t) => setTimes(prev => prev.filter(x => x !== t))

  const submit = (e) => {
    e.preventDefault()
    if (!times.length) return
    onSubmit({ name, dosage, instructions, times, frequency })
  }

  return (
    <>
      <form className="add-form glass-card" onSubmit={submit}>
        <h3 className="form-title">New Medication</h3>
        <div className="af-grid">
          <label>
            <span className="field-label">Name *</span>
            <input className="glass-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Lisinopril" required />
          </label>
          <label>
            <span className="field-label">Dosage *</span>
            <input className="glass-input" value={dosage} onChange={e => setDosage(e.target.value)} placeholder="e.g. 10mg" required />
          </label>
          <label className="span2">
            <span className="field-label">Instructions</span>
            <textarea className="glass-input glass-textarea" value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Take with food…" rows={2} />
          </label>
          <label>
            <span className="field-label">
              Daily Times *{' '}
              <span className="hint">type HH:MM, press Enter</span>
            </span>
            <div className="tag-input-wrap" onClick={() => inputRef.current?.focus()}>
              {times.map(t => (
                <span key={t} className="tag">
                  {t}
                  <button type="button" className="tag-remove" onClick={e => { e.stopPropagation(); removeTime(t) }}>×</button>
                </span>
              ))}
              <input
                ref={inputRef}
                className="tag-text-input"
                type="text"
                value={timeInput}
                onChange={e => setTimeInput(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={pushTime}
                placeholder={times.length ? '' : '08:00'}
              />
            </div>
            {!times.length && <span className="err-hint">At least one time required</span>}
          </label>
          <label>
            <span className="field-label">Frequency</span>
            <select className="glass-input glass-select" value={frequency} onChange={e => setFrequency(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="as-needed">As needed</option>
            </select>
          </label>
        </div>
        <div className="af-actions">
          <button type="submit" className="glass-btn primary" disabled={!times.length}>
            Add Medication
          </button>
          <button type="button" className="glass-btn" onClick={onCancel}>Cancel</button>
        </div>
      </form>
      <style>{`
        .add-form { padding: 24px; margin-bottom: 18px; }
        .form-title { font-size: 15px; font-weight: 600; margin-bottom: 18px; }
        .af-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
        .af-grid label { display: flex; flex-direction: column; gap: 6px; }
        .af-grid .span2 { grid-column: 1 / -1; }
        .af-actions { display: flex; gap: 8px; }
        .hint { font-size: 11px; color: var(--text-tertiary); text-transform: none; font-weight: 400; letter-spacing: 0; }
        .err-hint { font-size: 12px; color: var(--danger); }
        .tag-input-wrap {
          min-height: 42px;
          display: flex; flex-wrap: wrap; align-items: center; gap: 5px;
          padding: 6px 10px;
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          cursor: text;
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
        }
        .tag-input-wrap:focus-within {
          border-color: rgba(0,212,170,0.5);
          box-shadow: 0 0 0 3px var(--accent-dim);
        }
        .tag {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 7px;
          background: var(--accent-dim);
          border: 1px solid var(--border-accent);
          border-radius: 20px;
          font-family: var(--font-mono);
          font-size: 11.5px;
          color: var(--accent);
        }
        .tag-remove {
          background: none; border: none; color: inherit; opacity: 0.65;
          cursor: pointer; font-size: 14px; line-height: 1; padding: 0;
        }
        .tag-remove:hover { opacity: 1; }
        .tag-text-input {
          background: none; border: none; outline: none;
          color: var(--text-primary); font-family: var(--font-mono);
          font-size: 13px; min-width: 64px; flex: 1;
        }
        .tag-text-input::placeholder { color: var(--text-tertiary); }
      `}</style>
    </>
  )
}
