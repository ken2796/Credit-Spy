import { useState } from 'react'
import { CreditItems } from './components/CreditItems'
import { HistoryChart } from './components/HistoryChart'
import { ScoreGauge } from './components/ScoreGauge'
import { accounts, alerts, factors, history, peso } from './data'

const NAV = [
  { href: '#items', label: 'Credit items' },
  { href: '#score', label: 'Overview' },
  { href: '#accounts', label: 'Accounts' },
  { href: '#alerts', label: 'Alerts' },
  { href: '#history', label: 'Score history' },
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
  const [scannedAt, setScannedAt] = useState<Date | null>(null)

  const current = history[history.length - 1].score
  const previous = history[history.length - 2].score

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
              {item.label}
              {item.href === '#alerts' && <span className="badge mono">{alerts.length}</span>}
            </a>
          ))}
        </div>
        <div className="sample-note">Sample data. Connect a bureau to watch your real file.</div>
      </nav>

      <main className="main">
        <header className="page-head">
          <div>
            <div className="eyebrow mono">
              Case file · {scannedAt ? `scanned ${scannedAt.toLocaleTimeString()}` : 'updated Nov 15'}
            </div>
            <h1>Your credit, under watch</h1>
          </div>
          <button type="button" className="primary" onClick={() => setScannedAt(new Date())}>
            Run a fresh scan
          </button>
        </header>

        <CreditItems />

        <div className="row">
          <ScoreGauge score={current} change={current - previous} />

          <section className="card factors">
            <h2>What is moving your score</h2>
            {factors.map((f) => (
              <div key={f.label} className="factor">
                <div className="factor-head">
                  <span>{f.label}</span>
                  <span className={`mono ${f.tone === 'watch' ? 'accent' : 'muted'}`}>{f.detail}</span>
                </div>
                <div className="bar">
                  <div className={`bar-fill ${f.tone}`} style={{ width: `${f.health}%` }} />
                </div>
              </div>
            ))}
          </section>
        </div>

        <HistoryChart points={history} />

        <div className="row">
          <section id="accounts" className="card accounts">
            <h2>Accounts on file</h2>
            {accounts.map((a) => {
              const used = Math.round((a.balance / a.limit) * 100)
              const isCard = a.kind === 'Credit card'
              return (
                <div key={a.name} className="list-row">
                  <div className="grow">
                    <div className="strong">{a.name}</div>
                    <div className="muted small">
                      {a.kind} · {a.note}
                    </div>
                  </div>
                  <div className="bar thin" aria-hidden="true">
                    <div className={`bar-fill ${isCard && used > 30 ? 'watch' : 'good'}`} style={{ width: `${used}%` }} />
                  </div>
                  <div className="amount mono">
                    {isCard ? `${peso.format(a.balance)} / ${peso.format(a.limit)}` : `${peso.format(a.balance)} left`}
                  </div>
                </div>
              )
            })}
          </section>

          <section id="alerts" className="card alerts">
            <h2>Spy reports</h2>
            {alerts.map((alert) => (
              <div key={alert.title} className="list-row top">
                <span className={`tag mono ${alert.level === 'WATCH' ? 'tag-watch' : 'tag-info'}`}>{alert.level}</span>
                <div>
                  <div className="strong">{alert.title}</div>
                  <div className="muted small">{alert.detail}</div>
                </div>
              </div>
            ))}
          </section>
        </div>
      </main>
    </div>
  )
}
