import { useState } from 'react'
import { CreditItems } from './components/CreditItems'
import { HistoryChart } from './components/HistoryChart'
import { ScoreGauge } from './components/ScoreGauge'
import { accounts, alerts, factors, history, peso } from './data'

const NAV = [
  { href: '#items', label: 'Credit items', short: 'Items', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { href: '#score', label: 'Overview', short: 'Overview', icon: 'M3.3 17a9 9 0 1 1 17.4 0M12 14l4-4' },
  { href: '#accounts', label: 'Accounts', short: 'Accounts', icon: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM2 10h20' },
  { href: '#alerts', label: 'Alerts', short: 'Alerts', icon: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0' },
  { href: '#history', label: 'Score history', short: 'History', icon: 'M3 3v18h18M7 15l4-4 3 3 5-6' },
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
              <svg className="nav-icon" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
              <span className="nav-label">{item.label}</span>
              <span className="nav-label-short">{item.short}</span>
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
