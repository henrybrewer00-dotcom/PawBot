import { useState, useCallback, useEffect, createContext, useContext } from 'react'
import Sidebar from './components/Sidebar.jsx'
import Topbar from './components/Topbar.jsx'
import Toast from './components/Toast.jsx'
import SetupModal from './components/SetupModal.jsx'
import Login from './pages/Login.jsx'
import Overview from './pages/Overview.jsx'
import Medications from './pages/Medications.jsx'
import Integrations from './pages/Integrations.jsx'
import AlertsMemory from './pages/AlertsMemory.jsx'
import { insforge } from './insforge.js'

export const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

const PAGES = {
  overview: Overview,
  medications: Medications,
  integrations: Integrations,
  alerts: AlertsMemory,
}

export default function App() {
  const [page, setPage] = useState('overview')
  const [seniorId, setSeniorId] = useState(() => localStorage.getItem('pawbot_senior_id') || '')
  const [showSetup, setShowSetup] = useState(!localStorage.getItem('pawbot_senior_id'))
  const [toasts, setToasts] = useState([])
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    insforge.auth.getCurrentUser().then(({ data }) => {
      setUser(data?.user ?? null)
    }).catch(() => {
      setUser(null)
    }).finally(() => {
      setAuthLoading(false)
    })
  }, [])

  const toast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200)
  }, [])

  const saveSeniorId = (id) => {
    localStorage.setItem('pawbot_senior_id', id)
    setSeniorId(id)
    setShowSetup(false)
  }

  async function handleLogout() {
    await insforge.auth.signOut()
    setUser(null)
  }

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)', fontSize: 15 }}>
        Loading…
      </div>
    )
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  const PageComponent = PAGES[page]

  return (
    <AppContext.Provider value={{ seniorId, toast, setPage, user }}>
      <div style={{
        display: 'flex',
        height: '100vh',
        position: 'relative',
        zIndex: 1,
      }}>
        <Sidebar currentPage={page} onNavigate={setPage} onLogout={handleLogout} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Topbar seniorId={seniorId} onOpenSetup={() => setShowSetup(true)} />
          <main style={{
            flex: 1,
            overflowY: 'auto',
            padding: '32px',
          }}>
            <PageComponent />
          </main>
        </div>
      </div>
      <Toast toasts={toasts} />
      {showSetup && (
        <SetupModal
          initialId={seniorId}
          onSave={saveSeniorId}
          onClose={seniorId ? () => setShowSetup(false) : null}
        />
      )}
    </AppContext.Provider>
  )
}
