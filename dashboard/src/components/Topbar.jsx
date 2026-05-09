export default function Topbar({ seniorId, account, onOpenSetup }) {
  const short = seniorId
    ? (seniorId.length > 22 ? seniorId.slice(0, 22) + '…' : seniorId)
    : 'Not configured'
  const roleLabel = account?.role === 'senior' ? 'Senior Portal' : 'Caretaker Portal'
  const showSeniorChip = account?.role === 'senior' && seniorId
  const showGear = account?.role === 'senior' && onOpenSetup

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <span className="tb-paw">🐾</span>
          <span className="tb-name">PawBot</span>
          <span className="tb-divider" />
          <span className="tb-subtitle">{roleLabel}</span>
        </div>
        <div className="topbar-right">
          {account && (
            <div className="senior-chip">
              <span className="chip-label">{account.role}</span>
              <span className="chip-id" title={account.email}>{account.name}</span>
            </div>
          )}
          {showSeniorChip && (
            <div className="senior-chip">
              <span className="chip-pulse" />
              <span className="chip-label">Senior</span>
              <span className="chip-id" title={seniorId}>{short}</span>
            </div>
          )}
          {showGear && (
            <button className="tb-gear" onClick={onOpenSetup} title="Settings">
              ⚙
            </button>
          )}
        </div>
      </header>
      <style>{`
        .topbar {
          height: var(--topbar-height);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
          border-bottom: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          flex-shrink: 0;
          position: relative;
          z-index: 5;
        }
        .topbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .tb-paw { font-size: 18px; }
        .tb-name {
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.2px;
        }
        .tb-divider {
          width: 1px;
          height: 14px;
          background: var(--border);
          opacity: 0.8;
        }
        .tb-subtitle {
          font-size: 12.5px;
          color: var(--text-tertiary);
          font-weight: 400;
        }
        .topbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .senior-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 12px 5px 10px;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 20px;
        }
        .chip-pulse {
          width: 6px;
          height: 6px;
          background: var(--accent);
          border-radius: 50%;
          box-shadow: 0 0 0 0 var(--accent-glow);
          animation: pulse 2.5s infinite;
          flex-shrink: 0;
        }
        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0 rgba(0, 212, 170, 0.5); }
          70%  { box-shadow: 0 0 0 6px rgba(0, 212, 170, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 212, 170, 0); }
        }
        .chip-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-tertiary);
        }
        .chip-id {
          font-family: var(--font-mono);
          font-size: 11.5px;
          color: var(--text-secondary);
        }
        .tb-gear {
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-size: 15px;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .tb-gear:hover {
          background: var(--bg-surface-hover);
          color: var(--text-primary);
          border-color: rgba(0, 0, 0, 0.14);
          transform: rotate(30deg);
        }
      `}</style>
    </>
  )
}
