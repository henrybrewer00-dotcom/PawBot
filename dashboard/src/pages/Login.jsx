import { useState } from 'react'
import { api } from '../api.js'
import { insforge } from '../insforge.js'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('caretaker')
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [verificationCode, setVerificationCode] = useState('')
  const [pendingSignup, setPendingSignup] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)

    try {
      if (mode === 'verify') {
        const { data, error: err } = await insforge.auth.verifyEmail({
          email: pendingSignup?.email ?? email,
          otp: verificationCode.trim(),
        })
        if (err) throw new Error(err.message)

        const profileBody = {
          role: pendingSignup?.role ?? role,
          name: pendingSignup?.name ?? name,
          phone: pendingSignup?.phone ?? phone,
        }
        const hasProfileDetails = profileBody.name?.trim() && profileBody.phone?.trim()
        const profileRes = hasProfileDetails ? await api('/api/me/profile', {
          method: 'POST',
          body: profileBody,
        }) : { profile: null }
        onLogin(data.user, profileRes.profile)
        return
      }

      let data, err
      if (mode === 'signup') {
        ({ data, error: err } = await insforge.auth.signUp({ email, password, name }))
      } else {
        ({ data, error: err } = await insforge.auth.signInWithPassword({ email, password }))
      }

      if (err) {
        const needsVerification = err.statusCode === 403 || /verification|required|verified/i.test(err.message ?? '')
        if (mode === 'signin' && needsVerification) {
          setPendingSignup({ email, role, name, phone })
          setMode('verify')
          setNotice('Enter the 6-digit verification code from your email.')
          await insforge.auth.resendVerificationEmail({ email })
          return
        }
        throw new Error(err.message)
      }
      if (mode === 'signup' && data?.requireEmailVerification) {
        setPendingSignup({ email, role, name, phone })
        if (data.verifyEmailMethod === 'link') {
          setNotice('Check your email for a verification link, then sign in.')
          setMode('signin')
        } else {
          setNotice('Enter the 6-digit code we sent to your email.')
          setMode('verify')
        }
        return
      }

      if (mode === 'signup' && data?.user) {
        const profileBody = { role, name, phone }
        const hasProfileDetails = profileBody.name?.trim() && profileBody.phone?.trim()
        const res = hasProfileDetails ? await api('/api/me/profile', {
          method: 'POST',
          body: profileBody,
        }) : { profile: null }
        onLogin(data.user, res.profile)
        return
      }

      if (data?.user) onLogin(data.user)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'var(--bg-primary)',
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: 400, padding: 40 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>🐾</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>PawBot</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {mode === 'verify' ? 'Verify your email' : mode === 'signin' ? 'Sign in to PawBot' : `Create a ${role} account`}
          </p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'verify' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Verification code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={verificationCode}
                onChange={e => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                required
                autoFocus
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text-primary)',
                  fontSize: 18,
                  letterSpacing: '0.18em',
                  outline: 'none',
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.45 }}>
                Sent to {pendingSignup?.email ?? email}.
              </span>
            </div>
          )}

          {mode === 'signup' && (
            <>
              <div className="role-tabs">
                <button type="button" className={role === 'caretaker' ? 'active' : ''} onClick={() => setRole('caretaker')}>
                  Caretaker
                </button>
                <button type="button" className={role === 'senior' ? 'active' : ''} onClick={() => setRole('senior')}>
                  Senior
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={role === 'caretaker' ? 'Caretaker name' : 'Senior name'}
                  required
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+15550000001"
                  required
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
              </div>
            </>
          )}

          {mode !== 'verify' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
              </div>
            </>
          )}

          {error && (
            <div style={{
              padding: '10px 13px',
              borderRadius: 8,
              background: 'var(--danger-dim)',
              border: '1px solid rgba(255,71,87,0.25)',
              color: 'var(--danger)',
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {notice && (
            <div style={{
              padding: '10px 13px',
              borderRadius: 8,
              background: 'var(--accent-dim)',
              border: '1px solid var(--border-accent)',
              color: 'var(--accent)',
              fontSize: 13,
            }}>
              {notice}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (mode === 'signup' && (!name.trim() || !phone.trim())) || (mode === 'verify' && verificationCode.length !== 6)}
            className="glass-btn"
            style={{
              marginTop: 6,
              padding: '12px 20px',
              width: '100%',
              justifyContent: 'center',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Please wait…' : mode === 'verify' ? 'Verify & continue' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {mode === 'verify' && (
          <p style={{ textAlign: 'center', marginTop: 14, fontSize: 13.5, color: 'var(--text-secondary)' }}>
            Need a new code?{' '}
            <button
              onClick={async () => {
                setError(null)
                const { error: err } = await insforge.auth.resendVerificationEmail({ email: pendingSignup?.email ?? email })
                if (err) setError(err.message)
                else setNotice('A new verification code was sent.')
              }}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13.5, padding: 0 }}
            >
              Resend code
            </button>
          </p>
        )}

        <p style={{ textAlign: 'center', marginTop: mode === 'verify' ? 12 : 20, fontSize: 13.5, color: 'var(--text-secondary)' }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
              setNotice(null)
              setVerificationCode('')
            }}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13.5, padding: 0 }}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
      <style>{`
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
      `}</style>
    </div>
  )
}
