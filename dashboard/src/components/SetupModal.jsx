import { useState } from 'react'

export default function SetupModal({ initialId, onSave, onClose }) {
  const [value, setValue] = useState(initialId || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (value.trim()) onSave(value.trim())
  }

  return (
    <>
      <div
        className="modal-overlay"
        onClick={e => e.target === e.currentTarget && onClose?.()}
      >
        <div className="modal glass-card-elevated">
          {onClose && (
            <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
          )}
          <div className="modal-header">
            <span className="modal-icon">🐾</span>
            <h2>Configure PawBot</h2>
            <p>Enter the Senior ID for the profile you want to monitor.</p>
          </div>
          <form onSubmit={handleSubmit} className="modal-form">
            <label>
              <span className="field-label">Senior ID</span>
              <input
                className="glass-input"
                type="text"
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="user_xxxxxxxxxxxxxxxx"
                autoFocus
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              className="glass-btn primary submit-btn"
              disabled={!value.trim()}
            >
              Save & Connect
            </button>
          </form>
        </div>
      </div>
      <style>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          animation: overlayIn 0.2s ease;
        }
        @keyframes overlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .modal {
          width: 440px;
          max-width: calc(100vw - 40px);
          padding: 40px;
          animation: modalUp 0.28s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }
        @keyframes modalUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .modal-close {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          border-radius: 6px;
          color: var(--text-tertiary);
          font-size: 14px;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .modal-close:hover {
          background: var(--bg-surface-hover);
          color: var(--text-primary);
        }
        .modal-header {
          text-align: center;
          margin-bottom: 28px;
        }
        .modal-icon {
          font-size: 36px;
          display: block;
          margin-bottom: 14px;
        }
        .modal-header h2 {
          font-size: 21px;
          color: var(--text-primary);
          margin-bottom: 8px;
        }
        .modal-header p {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.55;
        }
        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .modal-form label {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }
        .field-hint {
          font-size: 12px;
          color: var(--text-tertiary);
          line-height: 1.5;
        }
        .field-hint code {
          font-family: var(--font-mono);
          font-size: 11px;
          background: rgba(255,255,255,0.07);
          padding: 1px 5px;
          border-radius: 4px;
          color: var(--text-secondary);
        }
        .submit-btn {
          width: 100%;
          justify-content: center;
          padding: 12px;
          font-size: 14.5px;
        }
      `}</style>
    </>
  )
}
