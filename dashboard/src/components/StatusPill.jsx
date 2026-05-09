const CONFIG = {
  taken:        { label: 'Taken',         color: 'var(--success)',        bg: 'var(--success-dim)' },
  sent:         { label: 'Sent',          color: 'var(--warning)',        bg: 'var(--warning-dim)' },
  pending:      { label: 'Pending',       color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.06)' },
  escalated:    { label: 'Escalated',     color: 'var(--danger)',         bg: 'var(--danger-dim)' },
  active:       { label: 'Active',        color: 'var(--accent)',         bg: 'var(--accent-dim)' },
  inactive:     { label: 'Inactive',      color: 'var(--text-tertiary)',  bg: 'rgba(255,255,255,0.04)' },
  connected:    { label: 'Connected',     color: 'var(--success)',        bg: 'var(--success-dim)' },
  disconnected: { label: 'Not connected', color: 'var(--text-tertiary)',  bg: 'rgba(255,255,255,0.04)' },
  high:         { label: 'High Risk',     color: 'var(--danger)',         bg: 'var(--danger-dim)' },
  medium:       { label: 'Medium Risk',   color: 'var(--warning)',        bg: 'var(--warning-dim)' },
  low:          { label: 'Low Risk',      color: 'var(--info)',           bg: 'var(--info-dim)' },
}

export default function StatusPill({ status, label: override }) {
  const cfg = CONFIG[status] ?? {
    label: status,
    color: 'var(--text-secondary)',
    bg: 'rgba(255,255,255,0.06)',
  }

  return (
    <>
      <span
        className="status-pill"
        style={{ '--c': cfg.color, '--bg': cfg.bg }}
      >
        {override ?? cfg.label}
      </span>
      <style>{`
        .status-pill {
          display: inline-flex;
          align-items: center;
          padding: 3px 9px;
          border-radius: 20px;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          color: var(--c);
          background: var(--bg);
          white-space: nowrap;
          flex-shrink: 0;
        }
      `}</style>
    </>
  )
}
