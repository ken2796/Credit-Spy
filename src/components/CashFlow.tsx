import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { peso } from '../lib/format'
import { today } from '../lib/transactionStore'
import type { Kind, Transaction, TransactionStore } from '../lib/transactionStore'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

/** "2026-11" for a YYYY-MM-DD date. */
function monthOf(date: string): string {
  return date.slice(0, 7)
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number)
  return new Date(year, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

function dayLabel(date: string): string {
  const [year, m, d] = date.split('-').map(Number)
  return new Date(year, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number)
  const next = new Date(year, m - 1 + delta, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

export function CashFlow({ store }: { store: TransactionStore }) {
  const [entries, setEntries] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState(() => monthOf(today()))
  const [kind, setKind] = useState<Kind>('out')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)

  useEffect(() => {
    let cancelled = false
    store
      .list()
      .then((list) => !cancelled && setEntries(list))
      .catch((e: unknown) => !cancelled && setError(errorText(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [store])

  const amountValue = Number(amount)
  const valid = description.trim() !== '' && amountValue > 0 && date !== ''

  async function addEntry(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    setError(null)
    try {
      const created = await store.add({ kind, description: description.trim(), amount: amountValue, date })
      setEntries((list) => [created, ...list].sort((a, b) => b.date.localeCompare(a.date)))
      setDescription('')
      setAmount('')
      setMonth(monthOf(created.date))
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function removeEntry(id: string) {
    setError(null)
    try {
      await store.remove(id)
      setEntries((list) => list.filter((t) => t.id !== id))
    } catch (e) {
      setError(errorText(e))
    }
  }

  const shown = entries.filter((t) => monthOf(t.date) === month)
  const moneyIn = shown.filter((t) => t.kind === 'in').reduce((sum, t) => sum + t.amount, 0)
  const moneyOut = shown.filter((t) => t.kind === 'out').reduce((sum, t) => sum + t.amount, 0)
  const net = moneyIn - moneyOut

  return (
    <section id="cashflow" className="card">
      <div className="card-head">
        <h2>Money in &amp; out</h2>
        <div className="month-switch">
          <button type="button" className="ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
            ‹
          </button>
          <span className="mono small">{monthLabel(month)}</span>
          <button type="button" className="ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
            ›
          </button>
        </div>
      </div>

      <div className="budget-grid">
        <div className="budget-stat">
          <span className="muted small">Money in</span>
          <span className="budget-value mono money-in">{peso.format(moneyIn)}</span>
        </div>
        <div className="budget-stat">
          <span className="muted small">Money out</span>
          <span className="budget-value mono money-out">{peso.format(moneyOut)}</span>
        </div>
        <div className="budget-stat">
          <span className="muted small">Left</span>
          <span className={`budget-value mono ${net < 0 ? 'negative' : 'accent'}`}>{peso.format(net)}</span>
        </div>
      </div>

      <form className="item-form" onSubmit={addEntry}>
        <div className="kind-toggle field-wide" role="group" aria-label="Type of entry">
          <button type="button" className={kind === 'in' ? 'kind-button active-in' : 'kind-button'} aria-pressed={kind === 'in'} onClick={() => setKind('in')}>
            + Money in
          </button>
          <button type="button" className={kind === 'out' ? 'kind-button active-out' : 'kind-button'} aria-pressed={kind === 'out'} onClick={() => setKind('out')}>
            − Money out
          </button>
        </div>
        <label className="field field-wide">
          <span>Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={kind === 'in' ? 'e.g. Salary, client payment' : 'e.g. Groceries, electricity, fare'}
            maxLength={120}
            required
          />
        </label>
        <label className="field">
          <span>Amount (₱)</span>
          <input type="number" inputMode="decimal" min="0.01" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" required />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <button type="submit" className="primary" disabled={!valid}>
          Add
        </button>
      </form>

      {error && (
        <div className="error small" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty muted">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="empty muted">Nothing recorded for {monthLabel(month)} yet.</div>
      ) : (
        shown.map((t) => (
          <div key={t.id} className="item-row">
            <div className="item-main">
              <div className="strong">{t.description}</div>
              <div className="muted small">{dayLabel(t.date)}</div>
            </div>
            <div className={`item-numbers mono ${t.kind === 'in' ? 'money-in' : 'money-out'}`}>
              {t.kind === 'in' ? '+' : '−'}
              {peso.format(t.amount)}
            </div>
            <div className="item-actions">
              <button type="button" className="ghost" onClick={() => void removeEntry(t.id)} aria-label={`Remove ${t.description}`}>
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  )
}
