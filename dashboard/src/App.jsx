import { useState, useCallback, useEffect, createContext, useContext } from 'react'
import Sidebar from './components/Sidebar.jsx'
import Topbar from './components/Topbar.jsx'
import Toast from './components/Toast.jsx'
import SetupModal from './components/SetupModal.jsx'
import AccountSetup from './components/AccountSetup.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import CaretakerHome from './pages/CaretakerHome.jsx'
import Overview from './pages/Overview.jsx'
import Medications from './pages/Medications.jsx'
import Integrations from './pages/Integrations.jsx'
import AlertsMemory from './pages/AlertsMemory.jsx'
import { api } from './api.js'
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
  const [landingRole, setLandingRole] = useState(null) // null = show landing, string = show login with role
  const [showLanding, setShowLanding] = useState(true)
  const [seniorId, setSeniorId] = useState(() => localStorage.getItem('pawbot_senior_id') || '')
  const [showSetup, setShowSetup] = useState(!localStorage.getItem('pawbot_senior_id'))
  const [toasts, setToasts] = useState([])
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    insforge.auth.getCurrentUser().then(({ data }) => {
      setUser(data?.user ?? null)
    }).catch(() => {
      setUser(null)
    }).finally(() => {
      setAuthLoading(false)
    })
  }, [])

  const applyProfile = useCallback((nextProfile) => {
    setProfile(nextProfile)
    if (nextProfile?.seniorId) {
      localStorage.setItem('pawbot_senior_id', nextProfile.seniorId)
      setSeniorId(nextProfile.seniorId)
      setShowSetup(false)
    } else if (nextProfile?.account?.role === 'senior') {
      localStorage.setItem('pawbot_senior_id', nextProfile.account.id)
      setSeniorId(nextProfile.account.id)
      setShowSetup(false)
    } else if (nextProfile?.account?.role === 'caretaker') {
      localStorage.removeItem('pawbot_senior_id')
      setSeniorId('')
      setShowSetup(false)
      setPage('overview')
    }
  }, [])

  const loadProfile = useCallback(async () => {
    setProfileLoading(true)
    try {
      const res = await api('/api/me/profile')
      applyProfile(res.profile)
    } catch {
      setProfile(null)
    } finally {
      setProfileLoading(false)
    }
  }, [applyProfile])

  useEffect(() => {
    if (!user) {
      queueMicrotask(() => setProfile(null))
      return
    }
    queueMicrotask(() => loadProfile())
  }, [user, loadProfile])

  const toast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200)
  }, [])

  const saveSeniorId = (id, nextProfile) => {
    if (id) {
      localStorage.setItem('pawbot_senior_id', id)
      setSeniorId(id)
    }
    if (nextProfile) setProfile(nextProfile)
    setShowSetup(false)
  }

  async function handleLogout() {
    await insforge.auth.signOut()
    setUser(null)
    setProfile(null)
    setSeniorId('')
    setShowLanding(true)
    setLandingRole(null)
    localStorage.removeItem('pawbot_senior_id')
  }

  function handleLogin(nextUser, nextProfile) {
    setUser(nextUser)
    if (nextProfile) applyProfile(nextProfile)
  }

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)', fontSize: 15 }}>
        Loading…
      </div>
    )
  }

  if (!user) {
    if (showLanding) {
      return (
        <Landing
          onSelectRole={(role) => { setLandingRole(role); setShowLanding(false) }}
          onSignIn={() => { setLandingRole(null); setShowLanding(false) }}
        />
      )
    }
    return (
      <Login
        onLogin={handleLogin}
        defaultRole={landingRole}
        onBack={() => { setShowLanding(true); setLandingRole(null) }}
      />
    )
  }

  if (profileLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)', fontSize: 15 }}>
        Loading account…
      </div>
    )
  }

  if (!profile?.account) {
    return <AccountSetup user={user} onComplete={applyProfile} />
  }

  const isCaretaker = profile.account.role === 'caretaker'
  const PageComponent = isCaretaker ? CaretakerHome : (PAGES[page] ?? Overview)

  return (
    <AppContext.Provider value={{ seniorId, toast, setPage, user, profile, account: profile.account }}>
      <div style={{
        display: 'flex',
        height: '100vh',
        position: 'relative',
        zIndex: 1,
      }}>
        <Sidebar currentPage={page} onNavigate={setPage} onLogout={handleLogout} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Topbar
            seniorId={seniorId}
            account={profile.account}
            onOpenSetup={profile.account.role === 'senior' ? () => setShowSetup(true) : null}
          />
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
      {showSetup && profile.account.role === 'senior' && (
        <SetupModal
          initialId={seniorId}
          accountRole={profile.account.role}
          onSave={saveSeniorId}
          onClose={seniorId ? () => setShowSetup(false) : null}
        />
      )}
    </AppContext.Provider>
  )
}
