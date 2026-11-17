import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { peso } from '../lib/format'
import { savedAmount } from '../lib/savingsStore'
import type { SavingsGoal, SavingsStore } from '../lib/savingsStore'
import { today } from '../lib/transactionStore'

interface Props {
  store: SavingsStore
  /** Reports the total saved across all goals whenever it changes. */
  onTotalSaved: (total: number) => void
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

function dateLabel(date: string, withYear = false): string {
  const [year, m, d] = date.split('-').map(Number)
  return new Date(year, m - 1, d).toLocaleDateString('en-PH', withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' })
}

/** Whole months from today until the date, at least 1. */
function monthsUntil(date: string): number {
  const [year, m] = date.split('-').map(Number)
  const now = new Date()
  return Math.max(1, (year - now.getFullYear()) * 12 + (m - 1 - now.getMonth()))
}

export function Savings({ store, onTotalSaved }: Props) {
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [targetDate, setTargetDate] = useState('')

  useEffect(() => {
    let cancelled = false
    store
      .list()
      .then((list) => !cancelled && setGoals(list))
      .catch((e: unknown) => !cancelled && setError(errorText(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [store])

  const totalSaved = goals.reduce((sum, g) => sum + savedAmount(g), 0)
  const totalTarget = goals.reduce((sum, g) => sum + g.target, 0)

  useEffect(() => {
    onTotalSaved(totalSaved)
  }, [totalSaved, onTotalSaved])

  const targetValue = Number(target)
  const valid = name.trim() !== '' && targetValue > 0

  async function addGoal(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    setError(null)
    try {
      const created = await store.addGoal({ name: name.trim(), target: targetValue, targetDate: targetDate || null })
      setGoals((list) => [...list, created])
      setName('')
      setTarget('')
      setTargetDate('')
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function removeGoal(goal: SavingsGoal) {
    if (!window.confirm(`Remove the goal "${goal.name}" and its ${goal.entries.length} deposit records?`)) return
    setError(null)
    try {
      await store.removeGoal(goal.id)
      setGoals((list) => list.filter((g) => g.id !== goal.id))
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function addEntry(goalId: string, amount: number, date: string) {
    setError(null)
    try {
      const entry = await store.addEntry(goalId, amount, date)
      setGoals((list) =>
        list.map((g) => (g.id === goalId ? { ...g, entries: [entry, ...g.entries].sort((a, b) => b.date.localeCompare(a.date)) } : g)),
      )
      return true
    } catch (e) {
      setError(errorText(e))
      return false
    }
  }

  async function removeEntry(goalId: string, entryId: string) {
    setError(null)
    try {
      await store.removeEntry(entryId)
      setGoals((list) => list.map((g) => (g.id === goalId ? { ...g, entries: g.entries.filter((e) => e.id !== entryId) } : g)))
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <section id="savings" className="card">
      <div className="card-head">
        <h2>Savings</h2>
        <span className="mono muted small">
          {peso.format(totalSaved)} saved{totalTarget > 0 ? ` of ${peso.format(totalTarget)}` : ''}
        </span>
      </div>

      <form className="item-form" onSubmit={addGoal}>
        <label className="field field-wide">
          <span>Goal</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund, Vacation" maxLength={120} required />
        </label>
        <label className="field">
          <span>Target (₱)</span>
          <input type="number" inputMode="decimal" min="1" step="any" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="50000" required />
        </label>
        <label className="field">
          <span>Reach it by (optional)</span>
          <input type="date" value={targetDate} min={today()} onChange={(e) => setTargetDate(e.target.value)} />
        </label>
        <button type="submit" className="primary" disabled={!valid}>
          Add goal
        </button>
      </form>

      {error && (
        <div className="error small" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty muted">Loading savings…</div>
      ) : goals.length === 0 ? (
        <div className="empty muted">No savings goals yet. Add one above, then record each deposit.</div>
      ) : (
        goals.map((goal) => (
          <GoalRow
            key={goal.id}
            goal={goal}
            onAddEntry={(amount, date) => addEntry(goal.id, amount, date)}
            onRemoveEntry={(entryId) => void removeEntry(goal.id, entryId)}
            onRemove={() => void removeGoal(goal)}
          />
        ))
      )}
    </section>
  )
}

interface GoalRowProps {
  goal: SavingsGoal
  onAddEntry: (amount: number, date: string) => Promise<boolean>
  onRemoveEntry: (entryId: string) => void
  onRemove: () => void
}

function GoalRow({ goal, onAddEntry, onRemoveEntry, onRemove }: GoalRowProps) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [showHistory, setShowHistory] = useState(false)
  const [busy, setBusy] = useState(false)

  const saved = savedAmount(goal)
  const left = Math.max(0, goal.target - saved)
  const percent = Math.min(100, Math.max(0, Math.round((saved / goal.target) * 100)))
  const reached = saved >= goal.target
  const amountValue = Number(amount)
  const canSave = amountValue > 0 && date !== ''
  const canWithdraw = canSave && amountValue <= saved

  async function record(sign: 1 | -1) {
    setBusy(true)
    const ok = await onAddEntry(sign * amountValue, date)
    setBusy(false)
    if (ok) setAmount('')
  }

  let plan = ''
  if (reached) plan = 'Goal reached.'
  else if (goal.targetDate) {
    const months = monthsUntil(goal.targetDate)
    plan = `Save about ${peso.format(left / months)} a month to reach it by ${dateLabel(goal.targetDate, true)}.`
  }

  return (
    <div className="goal">
      <div className="item-row goal-head">
        <div className="item-main">
          <div className="strong">
            {goal.name} {reached && <span className="tag tag-info mono">REACHED</span>}
          </div>
          <div className="bar" role="img" aria-label={`${percent}% saved`}>
            <div className={`bar-fill ${reached ? 'saved' : 'good'}`} style={{ width: `${percent}%` }} />
          </div>
          <div className="muted small">
            {percent}% · {peso.format(left)} to go{plan ? ` · ${plan}` : ''}
          </div>
        </div>
        <div className="item-numbers mono">
          <div>{peso.format(saved)}</div>
          <div className="muted small">of {peso.format(goal.target)}</div>
        </div>
      </div>

      <div className="goal-actions">
        <label className="field">
          <span>Amount (₱)</span>
          <input type="number" inputMode="decimal" min="0.01" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000" />
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="button" className="primary" onClick={() => void record(1)} disabled={!canSave || busy}>
          + Save
        </button>
        <button type="button" className="ghost" onClick={() => void record(-1)} disabled={!canWithdraw || busy}>
          − Withdraw
        </button>
      </div>

      <div className="goal-links">
        <button type="button" className="link-button" onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>
          {showHistory ? 'Hide history' : `History (${goal.entries.length})`}
        </button>
        <button type="button" className="link-button" onClick={onRemove}>
          Remove goal
        </button>
      </div>

      {showHistory && (
        <div className="goal-history">
          {goal.entries.length === 0 ? (
            <div className="muted small">No deposits yet.</div>
          ) : (
            goal.entries.map((e) => (
              <div key={e.id} className="history-row">
                <span className="muted small">{dateLabel(e.date, true)}</span>
                <span className={`mono ${e.amount > 0 ? 'money-in' : 'money-out'}`}>
                  {e.amount > 0 ? '+' : '−'}
                  {peso.format(Math.abs(e.amount))}
                </span>
                <button type="button" className="link-button" onClick={() => onRemoveEntry(e.id)} aria-label={`Remove ${peso.format(Math.abs(e.amount))} on ${dateLabel(e.date, true)}`}>
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
