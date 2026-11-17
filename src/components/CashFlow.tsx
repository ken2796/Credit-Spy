import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Budget, BudgetStore } from '../lib/budgetStore'
import { peso } from '../lib/format'
import type { Tab } from '../lib/tabs'
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

function MonthSwitch({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="month-switch">
      <button type="button" className="ghost" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
        ‹
      </button>
      <span className="mono small">{monthLabel(month)}</span>
      <button type="button" className="ghost" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Next month">
        ›
      </button>
    </div>
  )
}

interface Props {
  tab: Tab
  store: TransactionStore
  budgetStore: BudgetStore
}

/** The monthly budget and the money in & out log, which share one month and one list of entries. */
export function CashFlow({ tab, store, budgetStore }: Props) {
  const [entries, setEntries] = useState<Transaction[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const [month, setMonth] = useState(() => monthOf(today()))

  useEffect(() => {
    let cancelled = false
    Promise.all([store.list(), budgetStore.list()])
      .then(([list, budgetList]) => {
        if (cancelled) return
        setEntries(list)
        setBudgets(budgetList)
      })
      .catch((e: unknown) => !cancelled && setError(errorText(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [store, budgetStore])

  const shown = entries.filter((t) => monthOf(t.date) === month)

  async function addEntry(entry: Omit<Transaction, 'id'>): Promise<boolean> {
    setError(null)
    try {
      const created = await store.add(entry)
      setEntries((list) => [created, ...list].sort((a, b) => b.date.localeCompare(a.date)))
      setMonth(monthOf(created.date))
      return true
    } catch (e) {
      setError(errorText(e))
      return false
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

  async function addBudget(name: string, limit: number): Promise<boolean> {
    setBudgetError(null)
    try {
      const created = await budgetStore.add(name, limit)
      setBudgets((list) => [...list, created])
      return true
    } catch (e) {
      setBudgetError(errorText(e))
      return false
    }
  }

  async function setLimit(id: string, limit: number) {
    setBudgetError(null)
    try {
      await budgetStore.setLimit(id, limit)
      setBudgets((list) => list.map((b) => (b.id === id ? { ...b, limit } : b)))
    } catch (e) {
      setBudgetError(errorText(e))
    }
  }

  async function removeBudget(budget: Budget) {
    if (!window.confirm(`Remove the ${budget.name} budget? Entries tagged ${budget.name} are kept but no longer counted against a budget.`)) return
    setBudgetError(null)
    try {
      await budgetStore.remove(budget.id)
      setBudgets((list) => list.filter((b) => b.id !== budget.id))
    } catch (e) {
      setBudgetError(errorText(e))
    }
  }

  if (tab === 'profile') return null

  return (
    <>
      <MonthlyBudget
        setup={tab === 'setup'}
        budgets={budgets}
        entries={shown}
        month={month}
        onMonth={setMonth}
        loading={loading}
        error={budgetError}
        onAdd={addBudget}
        onSetLimit={(id, limit) => void setLimit(id, limit)}
        onRemove={(b) => void removeBudget(b)}
      />
      {tab === 'home' && (
        <MoneyLog
          entries={shown}
          budgets={budgets}
          month={month}
          onMonth={setMonth}
          loading={loading}
          error={error}
          onAdd={addEntry}
          onRemove={(id) => void removeEntry(id)}
        />
      )}
    </>
  )
}

interface MonthlyBudgetProps {
  /** Setup adds and edits categories; Home only shows how much of each is spent. */
  setup: boolean
  budgets: Budget[]
  entries: Transaction[]
  month: string
  onMonth: (month: string) => void
  loading: boolean
  error: string | null
  onAdd: (name: string, limit: number) => Promise<boolean>
  onSetLimit: (id: string, limit: number) => void
  onRemove: (budget: Budget) => void
}

function MonthlyBudget({ setup, budgets, entries, month, onMonth, loading, error, onAdd, onSetLimit, onRemove }: MonthlyBudgetProps) {
  const [name, setName] = useState('')
  const [limit, setLimit] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const spentBy = new Map<string, number>()
  let uncategorized = 0
  for (const t of entries) {
    if (t.kind !== 'out') continue
    const budget = t.category ? budgets.find((b) => b.name === t.category) : undefined
    if (budget) spentBy.set(budget.id, (spentBy.get(budget.id) ?? 0) + t.amount)
    else uncategorized += t.amount
  }

  const totalLimit = budgets.reduce((sum, b) => sum + b.limit, 0)
  const totalSpent = budgets.reduce((sum, b) => sum + (spentBy.get(b.id) ?? 0), 0)
  const totalLeft = totalLimit - totalSpent

  const limitValue = Number(limit)
  const valid = name.trim() !== '' && limitValue > 0

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    if (await onAdd(name.trim(), limitValue)) {
      setName('')
      setLimit('')
    }
  }

  function saveEdit(id: string) {
    const value = Number(editValue)
    if (value > 0) onSetLimit(id, value)
    setEditing(null)
  }

  return (
    <section id="monthly-budget" className="card">
      <div className="card-head">
        <h2>Monthly budget</h2>
        {!setup && <MonthSwitch month={month} onChange={onMonth} />}
      </div>

      {!setup && budgets.length > 0 && (
        <div className="budget-grid">
          <div className="budget-stat">
            <span className="muted small">Budgeted</span>
            <span className="budget-value mono">{peso.format(totalLimit)}</span>
          </div>
          <div className="budget-stat">
            <span className="muted small">Spent</span>
            <span className="budget-value mono money-out">{peso.format(totalSpent)}</span>
          </div>
          <div className="budget-stat">
            <span className="muted small">{totalLeft < 0 ? 'Over budget' : 'Left to spend'}</span>
            <span className={`budget-value mono ${totalLeft < 0 ? 'negative' : 'accent'}`}>{peso.format(Math.abs(totalLeft))}</span>
          </div>
        </div>
      )}

      {setup && (
        <form className="item-form" onSubmit={submit}>
          <label className="field field-wide">
            <span>Category</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Groceries, Bills, Transport" maxLength={60} required />
          </label>
          <label className="field">
            <span>Monthly limit (₱)</span>
            <input type="number" inputMode="decimal" min="1" step="any" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="8000" required />
          </label>
          <button type="submit" className="primary" disabled={!valid}>
            Add budget
          </button>
        </form>
      )}

      {error && (
        <div className="error small" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty muted">Loading budget…</div>
      ) : budgets.length === 0 ? (
        <div className="empty muted">
          {setup ? (
            'No budget yet. Add a category with a monthly limit, then pick that category when you record money out on Home.'
          ) : (
            <>
              No budget yet. Add categories with monthly limits in <a href="#setup">Setup</a>.
            </>
          )}
        </div>
      ) : (
        budgets.map((b) => {
          const spent = spentBy.get(b.id) ?? 0
          const left = b.limit - spent
          const percent = Math.round((spent / b.limit) * 100)
          const tone = percent > 100 ? 'over' : percent >= 80 ? 'watch' : 'good'
          return (
            <div key={b.id} className="item-row">
              <div className="item-main">
                <div className="strong">{b.name}</div>
                <div className="bar" role="img" aria-label={`${percent}% of the ${b.name} budget spent`}>
                  <div className={`bar-fill ${tone}`} style={{ width: `${Math.min(100, percent)}%` }} />
                </div>
                <div className={`small ${left < 0 ? 'negative' : 'muted'}`}>
                  {peso.format(spent)} of {peso.format(b.limit)} · {left < 0 ? `${peso.format(-left)} over` : `${peso.format(left)} left`}
                </div>
              </div>
              {!setup ? null : editing === b.id ? (
                <div className="item-actions">
                  <label className="field budget-edit">
                    <span>New limit (₱)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="1"
                      step="any"
                      value={editValue}
                      autoFocus
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(b.id)
                        if (e.key === 'Escape') setEditing(null)
                      }}
                    />
                  </label>
                  <button type="button" className="primary" onClick={() => saveEdit(b.id)}>
                    Save
                  </button>
                  <button type="button" className="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="item-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setEditing(b.id)
                      setEditValue(String(b.limit))
                    }}
                    aria-label={`Change the ${b.name} limit`}
                  >
                    Edit limit
                  </button>
                  <button type="button" className="ghost" onClick={() => onRemove(b)} aria-label={`Remove the ${b.name} budget`}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          )
        })
      )}

      {!setup && budgets.length > 0 && uncategorized > 0 && (
        <div className="muted small">{peso.format(uncategorized)} of money out this month has no budget category.</div>
      )}
    </section>
  )
}

interface MoneyLogProps {
  entries: Transaction[]
  budgets: Budget[]
  month: string
  onMonth: (month: string) => void
  loading: boolean
  error: string | null
  onAdd: (entry: Omit<Transaction, 'id'>) => Promise<boolean>
  onRemove: (id: string) => void
}

function MoneyLog({ entries, budgets, month, onMonth, loading, error, onAdd, onRemove }: MoneyLogProps) {
  const [kind, setKind] = useState<Kind>('out')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [category, setCategory] = useState('')

  const amountValue = Number(amount)
  const valid = description.trim() !== '' && amountValue > 0 && date !== ''

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    const ok = await onAdd({
      kind,
      description: description.trim(),
      amount: amountValue,
      date,
      category: kind === 'out' && category ? category : null,
    })
    if (ok) {
      setDescription('')
      setAmount('')
    }
  }

  const moneyIn = entries.filter((t) => t.kind === 'in').reduce((sum, t) => sum + t.amount, 0)
  const moneyOut = entries.filter((t) => t.kind === 'out').reduce((sum, t) => sum + t.amount, 0)
  const net = moneyIn - moneyOut

  return (
    <section id="cashflow" className="card">
      <div className="card-head">
        <h2>Money in &amp; out</h2>
        <MonthSwitch month={month} onChange={onMonth} />
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

      <form className="item-form" onSubmit={submit}>
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
        {kind === 'out' && budgets.length > 0 && (
          <label className="field">
            <span>Budget category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">No category</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
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
      ) : entries.length === 0 ? (
        <div className="empty muted">Nothing recorded for {monthLabel(month)} yet.</div>
      ) : (
        entries.map((t) => (
          <div key={t.id} className="item-row">
            <div className="item-main">
              <div className="strong">{t.description}</div>
              <div className="muted small">
                {dayLabel(t.date)}
                {t.category ? ` · ${t.category}` : ''}
              </div>
            </div>
            <div className={`item-numbers mono ${t.kind === 'in' ? 'money-in' : 'money-out'}`}>
              {t.kind === 'in' ? '+' : '−'}
              {peso.format(t.amount)}
            </div>
            <div className="item-actions">
              <button type="button" className="ghost" onClick={() => onRemove(t.id)} aria-label={`Remove ${t.description}`}>
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  )
}
