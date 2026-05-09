import { useState } from 'react'
import { api } from '../api.js'

export default function AccountSetup({ user, onComplete }) {
  const [role, setRole] = useState('caretaker')
  const [name, setName] = useState(user?.email?.split('@')[0] ?? '')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await api('/api/me/profile', {
        method: 'POST',
        body: { role, name, phone },
      })
      onComplete(res.profile)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="glass-card auth-card">
        <div className="auth-head">
          <div className="auth-mark">🐾</div>
          <h1>Set Up PawBot</h1>
          <p>Choose how this account should use PawBot.</p>
        </div>
        <form onSubmit={submit} className="auth-form">
          <div className="role-tabs">
            <button type="button" className={role === 'caretaker' ? 'active' : ''} onClick={() => setRole('caretaker')}>
              Caretaker
            </button>
            <button type="button" className={role === 'senior' ? 'active' : ''} onClick={() => setRole('senior')}>
              Senior
            </button>
          </div>
          <label>
            <span>Name</span>
            <input value={name} onChange={e => setName(e.target.value)} required />
          </label>
          <label>
            <span>Phone</span>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+15550000001" required />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="glass-btn primary auth-submit" disabled={loading || !name.trim() || !phone.trim()}>
            {loading ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
      <style>{`
        .auth-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: var(--bg-primary);
        }
        .auth-card { width: 100%; max-width: 420px; padding: 38px; }
        .auth-head { text-align: center; margin-bottom: 28px; }
        .auth-mark { font-size: 36px; margin-bottom: 10px; }
        .auth-head h1 { font-size: 24px; margin-bottom: 6px; }
        .auth-head p { font-size: 14px; color: var(--text-secondary); }
        .auth-form { display: flex; flex-direction: column; gap: 14px; }
        .auth-form label { display: flex; flex-direction: column; gap: 6px; }
        .auth-form label span {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .auth-form input {
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.05);
          color: var(--text-primary);
          font-size: 14px;
          outline: none;
        }
        .role-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          padding: 4px;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .role-tabs button {
          border: 0;
          border-radius: 6px;
          padding: 9px;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font-weight: 600;
        }
        .role-tabs button.active {
          background: var(--accent-dim);
          color: var(--accent);
        }
        .auth-error {
          padding: 10px 13px;
          border-radius: 8px;
          background: var(--danger-dim);
          border: 1px solid rgba(255,71,87,0.25);
          color: var(--danger);
          font-size: 13px;
        }
        .auth-submit { width: 100%; justify-content: center; padding: 12px; }
      `}</style>
    </div>
  )
}
