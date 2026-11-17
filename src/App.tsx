import { useEffect, useState } from 'react'
import { CreditItems } from './components/CreditItems'
import { tabFromHash } from './lib/tabs'
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

  return (
    <div className="shell">
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
        </header>

        <CreditItems tab={tab} />
      </main>
    </div>
  )
}
