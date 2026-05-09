export default function Toast({ toasts }) {
  if (!toasts.length) return null

  const iconFor = (type) => {
    if (type === 'success') return '✓'
    if (type === 'error')   return '✕'
    return 'ℹ'
  }

  return (
    <>
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span className="toast-icon">{iconFor(t.type)}</span>
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
      <style>{`
        .toast-container {
          position: fixed;
          top: 20px;
          right: 20px;
          display: flex;
          flex-direction: column;
          gap: 9px;
          z-index: 200;
          pointer-events: none;
        }
        .toast {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 16px;
          background: rgba(16, 22, 40, 0.96);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 13.5px;
          color: var(--text-primary);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
          animation: toastIn 0.28s cubic-bezier(0.4, 0, 0.2, 1);
          min-width: 260px;
          max-width: 360px;
          line-height: 1.45;
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .toast-success { border-left: 3px solid var(--accent); }
        .toast-error   { border-left: 3px solid var(--danger); }
        .toast-info    { border-left: 3px solid var(--info); }
        .toast-icon {
          font-size: 12px;
          font-weight: 700;
          margin-top: 1px;
          flex-shrink: 0;
        }
        .toast-success .toast-icon { color: var(--accent); }
        .toast-error   .toast-icon { color: var(--danger); }
        .toast-info    .toast-icon { color: var(--info); }
      `}</style>
    </>
  )
}
