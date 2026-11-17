import { useCallback, useEffect, useState } from 'react'
import { CreditItems } from './components/CreditItems'
import { tabFromHash } from './lib/tabs'
import { PULL_THRESHOLD, usePullToRefresh } from './lib/usePullToRefresh'
import type { Tab } from './lib/tabs'

const NAV: { tab: Tab; label: string; icon: string }[] = [
  { tab: 'home', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  { tab: 'setup', label: 'Setup', icon: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' },
  { tab: 'profile', label: 'Profile', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8' },
]

const HEADINGS: Record<Tab, string> = {
  home: 'Your money, under watch',
  setup: 'Set up your numbers',
  profile: 'Account and members',
}

const REFRESH_ICON = 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6'

function timeLabel(date: Date): string {
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function Logo() {
  return (
    <svg aria-hidden="true" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="16" cy="16" r="13" />
      <circle cx="16" cy="16" r="7" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" />
      <path d="M16 16 L25 7" />
    </svg>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>(() => tabFromHash(window.location.hash))

  useEffect(() => {
    function onHash() {
      setTab(tabFromHash(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Bumping this reloads every list from the database, to pick up what other members added.
  const [refreshTick, setRefreshTick] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(() => new Date())

  const refresh = useCallback(() => {
    setRefreshTick((n) => n + 1)
    setUpdatedAt(new Date())
    setRefreshing(true)
    window.setTimeout(() => setRefreshing(false), 800)
  }, [])

  const pull = usePullToRefresh(refresh)
  const ready = pull >= PULL_THRESHOLD

  return (
    <div className="shell">
      {(pull > 0 || refreshing) && (
        <div className="pull-indicator" style={{ transform: `translate(-50%, ${refreshing ? 16 : pull - 24}px)` }} aria-hidden="true">
          <svg
            className={refreshing ? 'spin' : undefined}
            style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)`, opacity: ready ? 1 : 0.6 }}
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={REFRESH_ICON} />
          </svg>
        </div>
      )}
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <Logo />
          <span>Credit Spy</span>
        </div>
        <div className="nav-links">
          {NAV.map((item) => (
            <a
              key={item.tab}
              href={`#${item.tab}`}
              className={item.tab === tab ? 'nav-link active' : 'nav-link'}
              aria-current={item.tab === tab ? 'page' : undefined}
            >
              <svg className="nav-icon" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              <span className="nav-label">{item.label}</span>
            </a>
          ))}
        </div>
      </nav>

      <main className="main">
        <header className="page-head">
          <div>
            <div className="eyebrow mono">Credit Spy</div>
            <h1>{HEADINGS[tab]}</h1>
          </div>
          <div className="refresh-box">
            <button type="button" className="ghost refresh-button" onClick={refresh} disabled={refreshing}>
              <svg className={refreshing ? 'spin' : undefined} aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={REFRESH_ICON} />
              </svg>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <span className="muted small" aria-live="polite">
              Updated {timeLabel(updatedAt)}
            </span>
          </div>
        </header>

        <CreditItems tab={tab} refreshTick={refreshTick} />
      </main>
    </div>
  )
}
