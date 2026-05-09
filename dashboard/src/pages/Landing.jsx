export default function Landing({ onSelectRole, onSignIn }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
      background: 'var(--bg-base)',
      position: 'relative',
    }}>
      {/* Hero */}
      <div className="fade-in" style={{ textAlign: 'center', marginBottom: 52 }}>
        <div style={{ fontSize: 52, marginBottom: 14, lineHeight: 1 }}>🐾</div>
        <h1 style={{
          fontSize: 40,
          fontWeight: 800,
          letterSpacing: '-1px',
          color: 'var(--text-primary)',
          marginBottom: 10,
        }}>
          PawBot
        </h1>
        <p style={{
          fontSize: 17,
          color: 'var(--text-secondary)',
          fontWeight: 400,
          maxWidth: 400,
          lineHeight: 1.55,
        }}>
          AI-powered care companion — medication reminders, daily check-ins,
          and peace of mind for the whole family.
        </p>
      </div>

      {/* Role cards */}
      <div className="stagger" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 20,
        width: '100%',
        maxWidth: 640,
        marginBottom: 36,
      }}>
        <RoleCard
          emoji="👨‍👩‍👦"
          title="Caretaker"
          subtitle="I care for a loved one"
          features={['Track medications & refills', 'Monitor daily activity', 'Receive alerts & summaries']}
          accentColor="#00a887"
          onClick={() => onSelectRole('caretaker')}
        />
        <RoleCard
          emoji="🌟"
          title="Senior"
          subtitle="I use PawBot daily"
          features={['Medication reminders', 'Daily wellness check-ins', 'Stay connected with family']}
          accentColor="#7c3aed"
          onClick={() => onSelectRole('senior')}
        />
      </div>

      {/* Sign in link */}
      <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
        Already have an account?{' '}
        <button
          onClick={onSignIn}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            padding: 0,
          }}
        >
          Sign in
        </button>
      </p>
    </div>
  )
}

function RoleCard({ emoji, title, subtitle, features, accentColor, onClick }) {
  return (
    <>
      <button
        className="role-card"
        style={{ '--card-accent': accentColor }}
        onClick={onClick}
      >
        <div className="role-card-emoji">{emoji}</div>
        <div className="role-card-title">{title}</div>
        <div className="role-card-subtitle">{subtitle}</div>
        <ul className="role-card-features">
          {features.map(f => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <div className="role-card-cta">
          Get started <span style={{ marginLeft: 4 }}>→</span>
        </div>
      </button>
      <style>{`
        .role-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0;
          padding: 28px 26px 24px;
          background: #ffffff;
          border: 1.5px solid var(--border);
          border-radius: 20px;
          cursor: pointer;
          text-align: left;
          transition: all 200ms ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.07);
          position: relative;
          overflow: hidden;
        }
        .role-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: var(--card-accent);
          opacity: 0;
          transition: opacity 200ms ease;
        }
        .role-card:hover {
          transform: translateY(-3px);
          border-color: var(--card-accent);
          box-shadow: 0 8px 32px rgba(0,0,0,0.10), 0 0 0 1px var(--card-accent);
        }
        .role-card:hover::before {
          opacity: 1;
        }
        .role-card:active {
          transform: translateY(-1px);
        }
        .role-card-emoji {
          font-size: 32px;
          margin-bottom: 14px;
          line-height: 1;
        }
        .role-card-title {
          font-family: var(--font-display);
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
          letter-spacing: -0.3px;
        }
        .role-card-subtitle {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 18px;
          font-weight: 400;
        }
        .role-card-features {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin-bottom: 22px;
          width: 100%;
        }
        .role-card-features li {
          font-size: 13px;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .role-card-features li::before {
          content: '✓';
          font-size: 11px;
          font-weight: 700;
          color: var(--card-accent);
          flex-shrink: 0;
          width: 16px;
          height: 16px;
          background: color-mix(in srgb, var(--card-accent) 12%, transparent);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          text-align: center;
        }
        .role-card-cta {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--card-accent);
          display: flex;
          align-items: center;
          margin-top: auto;
        }
      `}</style>
    </>
  )
}
