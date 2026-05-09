import { useApp } from '../App.jsx'

const NAV_ITEMS = [
  { id: 'overview',     icon: '⌂',  label: 'Overview' },
  { id: 'medications',  icon: '💊', label: 'Medications', seniorOnly: true },
  { id: 'personal',     icon: '☷',  label: 'Personal Info', seniorOnly: true },
  { id: 'integrations', icon: '🔗', label: 'Integrations' },
  { id: 'alerts',       icon: '🛡', label: 'Alerts & Memory' },
]

export default function Sidebar({ currentPage, onNavigate, onLogout }) {
  const { account } = useApp()
  const navItems = account?.role === 'caretaker'
    ? NAV_ITEMS.filter(item => item.id === 'overview')
    : NAV_ITEMS.filter(item => !item.seniorOnly || account?.role === 'senior')
  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-paw">🐾</span>
          <span className="logo-text">PawBot</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item${currentPage === item.id ? ' active' : ''}`}
              onClick={() => onNavigate(item.id)}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="nav-item" onClick={onLogout} title="Sign out">
            <span className="nav-icon">↩</span>
            <span className="nav-label">Sign out</span>
          </button>
        </div>
      </aside>
      <style>{`
        .sidebar {
          width: var(--sidebar-collapsed);
          height: 100vh;
          display: flex;
          flex-direction: column;
          padding: 16px 0 24px;
          background: rgba(255, 255, 255, 0.80);
          border-right: 1px solid var(--border);
          transition: width var(--transition-slow);
          overflow: hidden;
          flex-shrink: 0;
          position: relative;
          z-index: 10;
        }
        .sidebar:hover {
          width: var(--sidebar-expanded);
        }
        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 4px 18px 20px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 12px;
          flex-shrink: 0;
          overflow: hidden;
        }
        .logo-paw {
          font-size: 22px;
          flex-shrink: 0;
        }
        .logo-text {
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.2px;
          white-space: nowrap;
          opacity: 0;
          transition: opacity var(--transition-slow);
        }
        .sidebar:hover .logo-text {
          opacity: 1;
        }
        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 0 8px;
          flex: 1;
        }
        .sidebar-footer {
          padding: 0 8px;
          border-top: 1px solid var(--border);
          padding-top: 10px;
        }
        .nav-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 10px 10px;
          background: none;
          border: none;
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          cursor: pointer;
          transition: background var(--transition-fast), color var(--transition-fast);
          text-align: left;
          white-space: nowrap;
          position: relative;
          overflow: hidden;
        }
        .nav-item::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 2.5px;
          height: 0;
          background: var(--accent);
          border-radius: 0 2px 2px 0;
          transition: height var(--transition-base);
        }
        .nav-item:hover {
          background: rgba(0, 0, 0, 0.04);
          color: var(--text-primary);
        }
        .nav-item.active {
          background: var(--accent-dim);
          color: var(--accent);
        }
        .nav-item.active::before {
          height: 22px;
        }
        .nav-icon {
          font-size: 17px;
          flex-shrink: 0;
          width: 26px;
          text-align: center;
          line-height: 1;
        }
        .nav-label {
          font-size: 13.5px;
          font-weight: 500;
          opacity: 0;
          transition: opacity var(--transition-slow);
          flex: 1;
          min-width: 0;
        }
        .sidebar:hover .nav-label {
          opacity: 1;
        }
      `}</style>
    </>
  )
}
