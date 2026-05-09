import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../App.jsx'
import { api } from '../api.js'

export default function PersonalInformation() {
  const { seniorId, toast } = useApp()
  const [personalInfo, setPersonalInfo] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!seniorId) return
    setLoading(true)
    try {
      const res = await api(`/api/seniors/${seniorId}/personal-info`)
      setPersonalInfo(res.personalInfo)
      setEmail(res.personalInfo?.email ?? '')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [seniorId, toast])

  useEffect(() => {
    queueMicrotask(() => load())
  }, [load])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const body = { email }
      if (password) body.password = password
      const res = await api(`/api/seniors/${seniorId}/personal-info`, {
        method: 'PUT',
        body,
      })
      setPersonalInfo(res.personalInfo)
      setEmail(res.personalInfo?.email ?? email)
      setPassword('')
      toast('Personal information saved.')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!seniorId) {
    return (
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        Configure a Senior ID before saving personal information.
      </p>
    )
  }

  return (
    <>
      <div className="personal-page fade-in">
        <div className="page-header">
          <div>
            <h1>Personal Information</h1>
            <p className="page-sub">Saved credentials are available to backend agents for future automated tasks.</p>
          </div>
          {personalInfo?.updatedAt && (
            <span className="updated-chip">
              Updated {new Date(personalInfo.updatedAt).toLocaleString()}
            </span>
          )}
        </div>

        <form className="personal-card glass-card" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Email</span>
              <input
                className="glass-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="senior@example.com"
                disabled={loading}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Password</span>
              <input
                className="glass-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={personalInfo?.hasPassword ? 'Saved password unchanged' : 'Enter password'}
                disabled={loading}
              />
            </label>
          </div>

          <div className="save-row">
            <span className="save-status">
              {personalInfo?.hasPassword ? 'Password saved for agent use.' : 'No password saved yet.'}
            </span>
            <button className="glass-btn primary" type="submit" disabled={loading || saving}>
              {saving ? 'Saving...' : 'Save Personal Info'}
            </button>
          </div>
        </form>

        <div className="agent-note glass-card">
          <span className="note-glyph">i</span>
          <p>
            Agents can read this later through the protected agent endpoint. The dashboard does not display the saved
            password after it is stored; entering a new password replaces it.
          </p>
        </div>
      </div>

      <style>{`
        .personal-page { max-width: 720px; }
        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 24px;
        }
        .page-header h1 { font-size: 24px; margin-bottom: 5px; }
        .page-sub { font-size: 13.5px; color: var(--text-secondary); line-height: 1.5; }
        .updated-chip {
          flex-shrink: 0;
          padding: 7px 10px;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: rgba(255,255,255,0.55);
          color: var(--text-tertiary);
          font-size: 11.5px;
          white-space: nowrap;
        }
        .personal-card { padding: 22px; margin-bottom: 14px; }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .save-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }
        .save-status { color: var(--text-tertiary); font-size: 12.5px; }
        .agent-note {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px 18px;
          background: rgba(30,144,255,0.05);
          border-color: rgba(30,144,255,0.18);
        }
        .note-glyph {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--info);
          color: white;
          font-size: 12px;
          font-weight: 800;
          flex-shrink: 0;
        }
        .agent-note p {
          color: var(--text-secondary);
          font-size: 13px;
          line-height: 1.55;
        }
        @media (max-width: 640px) {
          .page-header { flex-direction: column; }
          .form-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  )
}
