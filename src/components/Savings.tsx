import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { peso } from '../lib/format'
import { loansOf, owedTo, savedAmount } from '../lib/savingsStore'
import type { NewEntry, SavingsEntry, SavingsGoal, SavingsStore } from '../lib/savingsStore'
import type { Tab } from '../lib/tabs'
import { today } from '../lib/transactionStore'

interface Props {
  tab: Tab
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

/** Goals are created and removed on Setup; deposits, borrowing and paying back happen on Home. */
export function Savings({ tab, store, onTotalSaved }: Props) {
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
  const totalOwed = goals.reduce((sum, g) => sum + owedTo(g), 0)

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

  async function addEntry(goalId: string, input: NewEntry) {
    setError(null)
    try {
      const entry = await store.addEntry(goalId, input)
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
      // Removing a borrow also removes its pay-backs (the database cascades them).
      setGoals((list) =>
        list.map((g) => (g.id === goalId ? { ...g, entries: g.entries.filter((e) => e.id !== entryId && e.loanId !== entryId) } : g)),
      )
    } catch (e) {
      setError(errorText(e))
    }
  }

  if (tab === 'profile') return null
  const setup = tab === 'setup'

  return (
    <section id="savings" className="card">
      <div className="card-head">
        <h2>Savings</h2>
        <span className="mono muted small">
          {peso.format(totalSaved)} saved{totalTarget > 0 ? ` of ${peso.format(totalTarget)}` : ''}
        </span>
      </div>

      {!setup && totalOwed > 0 && (
        <div className="owed-banner">
          You still owe your savings <strong className="mono">{peso.format(totalOwed)}</strong>. Pay it back from each goal below.
        </div>
      )}

      {setup && (
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
      )}

      {error && (
        <div className="error small" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty muted">Loading savings…</div>
      ) : goals.length === 0 ? (
        <div className="empty muted">
          {setup ? (
            'No savings goals yet. Add one above, then record each deposit on Home.'
          ) : (
            <>
              No savings goals yet. Add one in <a href="#setup">Setup</a>.
            </>
          )}
        </div>
      ) : setup ? (
        goals.map((goal) => (
          <div key={goal.id} className="item-row">
            <div className="item-main">
              <div className="strong">{goal.name}</div>
              <div className="muted small">
                Target {peso.format(goal.target)}
                {goal.targetDate ? ` by ${dateLabel(goal.targetDate, true)}` : ''} · {peso.format(savedAmount(goal))} saved
              </div>
            </div>
            <div className="item-actions">
              <button type="button" className="ghost" onClick={() => void removeGoal(goal)} aria-label={`Remove the goal ${goal.name}`}>
                Remove
              </button>
            </div>
          </div>
        ))
      ) : (
        goals.map((goal) => (
          <GoalRow
            key={goal.id}
            goal={goal}
            onAddEntry={(input) => addEntry(goal.id, input)}
            onRemoveEntry={(entryId) => void removeEntry(goal.id, entryId)}
          />
        ))
      )}
    </section>
  )
}

interface GoalRowProps {
  goal: SavingsGoal
  onAddEntry: (entry: NewEntry) => Promise<boolean>
  onRemoveEntry: (entryId: string) => void
}

const KIND_LABEL: Record<SavingsEntry['kind'], string> = {
  deposit: 'Saved',
  withdraw: 'Withdrew',
  borrow: 'Borrowed',
  repay: 'Paid back',
}

function GoalRow({ goal, onAddEntry, onRemoveEntry }: GoalRowProps) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [borrowing, setBorrowing] = useState(false)
  const [reason, setReason] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [busy, setBusy] = useState(false)

  const saved = savedAmount(goal)
  const left = Math.max(0, goal.target - saved)
  const percent = Math.min(100, Math.max(0, Math.round((saved / goal.target) * 100)))
  const reached = saved >= goal.target
  const loans = loansOf(goal)
  const openLoans = loans.filter((l) => l.owed > 0)
  const owed = openLoans.reduce((sum, l) => sum + l.owed, 0)
  const amountValue = Number(amount)
  const canSave = amountValue > 0 && date !== ''
  const canTakeOut = canSave && amountValue <= saved

  async function record(entry: NewEntry) {
    setBusy(true)
    const ok = await onAddEntry(entry)
    setBusy(false)
    if (ok) {
      setAmount('')
      setReason('')
      setDueDate('')
      setBorrowing(false)
    }
    return ok
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
            {owed > 0 && <span className="tag tag-owed mono">OWED {peso.format(owed)}</span>}
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
          {owed > 0 && <div className="muted small">{peso.format(saved + owed)} once paid back</div>}
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
        <button type="button" className="primary" onClick={() => void record({ kind: 'deposit', amount: amountValue, date })} disabled={!canSave || busy}>
          + Save
        </button>
        <button type="button" className="ghost" onClick={() => void record({ kind: 'withdraw', amount: amountValue, date })} disabled={!canTakeOut || busy}>
          − Withdraw
        </button>
        <button
          type="button"
          className={borrowing ? 'ghost borrow-toggle active' : 'ghost borrow-toggle'}
          onClick={() => setBorrowing(!borrowing)}
          aria-expanded={borrowing}
        >
          Borrow
        </button>
      </div>

      {borrowing && (
        <div className="borrow-form">
          <p className="muted small">
            Borrowing takes money out of this goal as a loan to yourself. It is tracked until you pay it back.
          </p>
          <div className="goal-actions">
            <label className="field field-wide">
              <span>What is it for?</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Tuition, car repair" maxLength={120} />
            </label>
            <label className="field">
              <span>Pay back by (optional)</span>
              <input type="date" value={dueDate} min={date} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <button
              type="button"
              className="primary"
              onClick={() => void record({ kind: 'borrow', amount: amountValue, date, note: reason.trim() || null, dueDate: dueDate || null })}
              disabled={!canTakeOut || busy}
            >
              Borrow {amountValue > 0 ? peso.format(amountValue) : ''}
            </button>
          </div>
          {amountValue > saved && <div className="small negative">You can borrow up to {peso.format(saved)} from this goal.</div>}
        </div>
      )}

      {openLoans.length > 0 && (
        <div className="loans">
          <div className="strong small">Borrowed from this goal</div>
          {openLoans.map((loan) => (
            <LoanRow key={loan.entry.id} loan={loan} busy={busy} onPay={(value, payDate) => record({ kind: 'repay', amount: value, date: payDate, loanId: loan.entry.id })} />
          ))}
        </div>
      )}

      <div className="goal-links">
        <button type="button" className="link-button" onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>
          {showHistory ? 'Hide history' : `History (${goal.entries.length})`}
        </button>
      </div>

      {showHistory && (
        <div className="goal-history">
          {goal.entries.length === 0 ? (
            <div className="muted small">Nothing recorded yet.</div>
          ) : (
            goal.entries.map((e) => (
              <div key={e.id} className="history-row">
                <span className="muted small">
                  {dateLabel(e.date, true)} · {KIND_LABEL[e.kind]}
                  {e.note ? ` · ${e.note}` : ''}
                </span>
                <span className={`mono ${e.amount > 0 ? 'money-in' : 'money-out'}`}>
                  {e.amount > 0 ? '+' : '−'}
                  {peso.format(Math.abs(e.amount))}
                </span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    if (e.kind === 'borrow' && loans.some((l) => l.entry.id === e.id && l.repaid > 0)) {
                      if (!window.confirm('Remove this borrow and the pay-backs recorded for it?')) return
                    }
                    onRemoveEntry(e.id)
                  }}
                  aria-label={`Remove ${KIND_LABEL[e.kind].toLowerCase()} ${peso.format(Math.abs(e.amount))} on ${dateLabel(e.date, true)}`}
                >
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

interface LoanRowProps {
  loan: ReturnType<typeof loansOf>[number]
  busy: boolean
  onPay: (amount: number, date: string) => Promise<boolean>
}

function LoanRow({ loan, busy, onPay }: LoanRowProps) {
  const [amount, setAmount] = useState('')
  const value = Number(amount)
  const percent = Math.round((loan.repaid / loan.borrowed) * 100)
  const overdue = loan.entry.dueDate !== null && loan.entry.dueDate < today()

  async function pay(payValue: number) {
    if (await onPay(payValue, today())) setAmount('')
  }

  return (
    <div className="loan-row">
      <div className="item-main">
        <div className="small">
          <span className="strong">{loan.entry.note ?? 'Borrowed'}</span>
          <span className="muted"> · {dateLabel(loan.entry.date, true)}</span>
          {loan.entry.dueDate && (
            <span className={overdue ? 'negative' : 'muted'}>
              {' '}
              · {overdue ? 'was due' : 'pay back by'} {dateLabel(loan.entry.dueDate, true)}
            </span>
          )}
        </div>
        <div className="bar" role="img" aria-label={`${percent}% paid back`}>
          <div className="bar-fill saved" style={{ width: `${percent}%` }} />
        </div>
        <div className="muted small">
          Paid back {peso.format(loan.repaid)} of {peso.format(loan.borrowed)} · <span className="accent">{peso.format(loan.owed)} still owed</span>
        </div>
      </div>
      <div className="goal-actions">
        <label className="field">
          <span>Pay back (₱)</span>
          <input type="number" inputMode="decimal" min="0.01" max={loan.owed} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(loan.owed)} />
        </label>
        <button type="button" className="primary" onClick={() => void pay(value)} disabled={busy || !(value > 0 && value <= loan.owed)}>
          Pay back
        </button>
        <button type="button" className="ghost" onClick={() => void pay(loan.owed)} disabled={busy}>
          Pay all {peso.format(loan.owed)}
        </button>
      </div>
    </div>
  )
}
