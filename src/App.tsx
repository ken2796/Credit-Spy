import { useState } from 'react'
import { CreditItems } from './components/CreditItems'

const NAV = [
  { href: '#budget', label: 'This month', short: 'Budget', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { href: '#income', label: 'Income', short: 'Income', icon: 'M12 19V5M5 12l7-7 7 7' },
  { href: '#items', label: 'Credit items', short: 'Items', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { href: '#cashflow', label: 'Pasok at labas', short: 'In / Out', icon: 'M7 17L17 7M7 7h10v10' },
]

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
  const [active, setActive] = useState(NAV[0].href)

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
              key={item.href}
              href={item.href}
              className={item.href === active ? 'nav-link active' : 'nav-link'}
              aria-current={item.href === active ? 'page' : undefined}
              onClick={() => setActive(item.href)}
            >
              <svg className="nav-icon" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              <span className="nav-label">{item.label}</span>
              <span className="nav-label-short">{item.short}</span>
            </a>
          ))}
        </div>
      </nav>

      <main className="main">
        <header className="page-head">
          <div>
            <div className="eyebrow mono">Credit Spy</div>
            <h1>Bantay sa pera mo</h1>
          </div>
        </header>

        <CreditItems />
      </main>
    </div>
  )
}
