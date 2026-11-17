import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { peso } from '../lib/format'
import { localIncomeStore, supabaseIncomeStore } from '../lib/incomeStore'
import type { IncomeStore } from '../lib/incomeStore'
import { localStore, supabaseStore } from '../lib/itemStore'
import { localTransactionStore, supabaseTransactionStore } from '../lib/transactionStore'
import type { TransactionStore } from '../lib/transactionStore'
import type { CreditItem, ItemStore } from '../lib/itemStore'
import { supabase } from '../lib/supabase'
import { AuthForm } from './AuthForm'
import { CashFlow } from './CashFlow'
import { IncomeList } from './IncomeList'

type TermUnit = 'months' | 'years'

/** Everything shown for an item is derived from total, term and months paid. */
function compute(item: Pick<CreditItem, 'total' | 'termMonths' | 'monthsPaid'>) {
  const monthly = item.total / item.termMonths
  const paid = monthly * item.monthsPaid
  return {
    monthly,
    paid,
    remaining: Math.max(0, item.total - paid),
    monthsLeft: item.termMonths - item.monthsPaid,
    percent: Math.round((item.monthsPaid / item.termMonths) * 100),
  }
}

function termLabel(months: number): string {
  if (months % 12 !== 0) return `${months} months`
  const years = months / 12
  return `${years} ${years === 1 ? 'year' : 'years'} (${months} months)`
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

/** Picks where items live: Supabase when configured (sign-in required), otherwise this browser. */
export function CreditItems() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(supabase === null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const store = useMemo<ItemStore | null>(() => {
    if (!supabase) return localStore
    return userId ? supabaseStore(supabase) : null
  }, [userId])
  const incomeStore = useMemo<IncomeStore | null>(() => {
    if (!supabase) return localIncomeStore
    return userId ? supabaseIncomeStore(supabase) : null
  }, [userId])

  const transactionStore = useMemo<TransactionStore | null>(() => {
    if (!supabase) return localTransactionStore
    return userId ? supabaseTransactionStore(supabase) : null
  }, [userId])

  const [monthlyIncome, setMonthlyIncome] = useState(0)
  const [monthlyDues, setMonthlyDues] = useState(0)
  const reportIncome = useCallback((total: number) => setMonthlyIncome(total), [])
  const reportDues = useCallback((total: number) => setMonthlyDues(total), [])

  if (!ready) {
    return (
      <section id="items" className="card">
        <h2>Credit Spy</h2>
        <div className="muted">Loading…</div>
      </section>
    )
  }

  if (supabase && !store) {
    return (
      <section id="items" className="card">
        <h2>Mag-sign in</h2>
        <AuthForm client={supabase} />
      </section>
    )
  }

  const left = monthlyIncome - monthlyDues
  const key = userId ?? 'local'

  return (
    <>
      <section id="budget" className="card">
        <div className="card-head">
          <h2>This month</h2>
          {supabase && session && (
            <div className="account-row small">
              <span className="muted">Signed in as {session.user.email}</span>
              <button type="button" className="ghost" onClick={() => void supabase?.auth.signOut()}>
                Sign out
              </button>
            </div>
          )}
        </div>
        <div className="budget-grid">
          <div className="budget-stat">
            <span className="muted small">Income</span>
            <span className="budget-value mono">{peso.format(monthlyIncome)}</span>
          </div>
          <div className="budget-stat">
            <span className="muted small">Credit dues</span>
            <span className="budget-value mono">{peso.format(monthlyDues)}</span>
          </div>
          <div className="budget-stat">
            <span className="muted small">Left after dues</span>
            <span className={`budget-value mono ${left < 0 ? 'negative' : 'accent'}`}>{peso.format(left)}</span>
          </div>
        </div>
        {monthlyIncome > 0 && (
          <div className="bar" role="img" aria-label={`Dues use ${Math.round((monthlyDues / monthlyIncome) * 100)}% of income`}>
            <div
              className={`bar-fill ${monthlyDues / monthlyIncome > 0.4 ? 'watch' : 'good'}`}
              style={{ width: `${Math.min(100, (monthlyDues / monthlyIncome) * 100)}%` }}
            />
          </div>
        )}
        <div className="muted small">
          {monthlyIncome > 0
            ? `Credit dues take ${Math.round((monthlyDues / monthlyIncome) * 100)}% of your monthly income.`
            : 'Add your income below to see how much is left after your credit dues.'}
        </div>
      </section>
      <IncomeList key={`income-${key}`} store={incomeStore ?? localIncomeStore} onMonthlyTotal={reportIncome} />
      <ItemList key={`items-${key}`} store={store ?? localStore} onMonthlyDue={reportDues} />
      <CashFlow key={`cash-${key}`} store={transactionStore ?? localTransactionStore} />
    </>
  )
}

interface ItemListProps {
  store: ItemStore
  /** Reports the total due every month whenever the list changes. */
  onMonthlyDue: (total: number) => void
}

function ItemList({ store, onMonthlyDue }: ItemListProps) {
  const [items, setItems] = useState<CreditItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [total, setTotal] = useState('')
  const [term, setTerm] = useState('')
  const [unit, setUnit] = useState<TermUnit>('months')
  const [monthsPaid, setMonthsPaid] = useState('0')

  useEffect(() => {
    let cancelled = false
    store
      .list()
      .then((list) => !cancelled && setItems(list))
      .catch((e: unknown) => !cancelled && setError(errorText(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [store])

  const totalValue = Number(total)
  const termMonths = Math.round(Number(term) * (unit === 'years' ? 12 : 1))
  const paidValue = Math.min(Math.max(0, Math.round(Number(monthsPaid) || 0)), Math.max(termMonths, 0))
  const valid = name.trim() !== '' && totalValue > 0 && termMonths >= 1
  const preview = totalValue > 0 && termMonths >= 1 ? compute({ total: totalValue, termMonths, monthsPaid: paidValue }) : null

  async function addItem(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    setError(null)
    try {
      const created = await store.add({ name: name.trim(), total: totalValue, termMonths, monthsPaid: paidValue })
      setItems((list) => [...list, created])
      setName('')
      setTotal('')
      setTerm('')
      setMonthsPaid('0')
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function changePaid(item: CreditItem, delta: number) {
    const next = Math.min(item.termMonths, Math.max(0, item.monthsPaid + delta))
    if (next === item.monthsPaid) return
    setError(null)
    try {
      await store.setMonthsPaid(item.id, next)
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, monthsPaid: next } : i)))
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function removeItem(id: string) {
    setError(null)
    try {
      await store.remove(id)
      setItems((list) => list.filter((i) => i.id !== id))
    } catch (e) {
      setError(errorText(e))
    }
  }

  const totals = items.reduce(
    (sum, item) => {
      const c = compute(item)
      return {
        monthly: sum.monthly + (c.monthsLeft > 0 ? c.monthly : 0),
        remaining: sum.remaining + c.remaining,
      }
    },
    { monthly: 0, remaining: 0 },
  )

  useEffect(() => {
    onMonthlyDue(totals.monthly)
  }, [totals.monthly, onMonthlyDue])

  return (
    <section id="items" className="card">
      <div className="card-head">
        <h2>Credit items</h2>
        <span className="mono muted small">
          {items.length} {items.length === 1 ? 'item' : 'items'} · {store.label}
        </span>
      </div>

      <form className="item-form" onSubmit={addItem}>
        <label className="field field-wide">
          <span>Item</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Laptop" maxLength={120} required />
        </label>
        <label className="field">
          <span>Total amount (₱)</span>
          <input type="number" inputMode="decimal" min="1" step="any" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="60000" required />
        </label>
        <label className="field field-narrow">
          <span>Term</span>
          <input type="number" inputMode="numeric" min="1" step="1" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="12" required />
        </label>
        <label className="field field-narrow">
          <span>Unit</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value as TermUnit)}>
            <option value="months">Months</option>
            <option value="years">Years</option>
          </select>
        </label>
        <label className="field field-narrow">
          <span>Months paid</span>
          <input type="number" inputMode="numeric" min="0" max={termMonths >= 1 ? termMonths : undefined} step="1" value={monthsPaid} onChange={(e) => setMonthsPaid(e.target.value)} />
        </label>
        <button type="submit" className="primary" disabled={!valid}>
          Add item
        </button>
      </form>

      <div className="item-preview mono small" aria-live="polite">
        {preview
          ? `Auto-computed: ${peso.format(preview.monthly)} per month · ${peso.format(preview.paid)} paid · ${peso.format(preview.remaining)} left · ${preview.monthsLeft} of ${termMonths} months to go`
          : 'Enter the amount and term to see the monthly payment.'}
      </div>

      {error && (
        <div className="error small" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty muted">Loading items…</div>
      ) : items.length === 0 ? (
        <div className="empty muted">No credit items yet. Add the first one above.</div>
      ) : (
        <>
          {items.map((item) => {
            const c = compute(item)
            const done = c.monthsLeft === 0
            return (
              <div key={item.id} className="item-row">
                <div className="item-main">
                  <div className="strong">
                    {item.name} {done && <span className="tag tag-info mono">PAID OFF</span>}
                  </div>
                  <div className="muted small">
                    {peso.format(item.total)} · {termLabel(item.termMonths)} · {peso.format(c.monthly)} per month
                  </div>
                  <div className="bar" role="img" aria-label={`${c.percent}% paid`}>
                    <div className="bar-fill good" style={{ width: `${c.percent}%` }} />
                  </div>
                </div>
                <div className="item-numbers mono">
                  <div>{peso.format(c.remaining)} left</div>
                  <div className="muted small">
                    {item.monthsPaid} of {item.termMonths} months paid
                  </div>
                </div>
                <div className="item-actions">
                  <button type="button" className="ghost" onClick={() => void changePaid(item, -1)} disabled={item.monthsPaid === 0} aria-label={`Undo one paid month for ${item.name}`}>
                    −1
                  </button>
                  <button type="button" className="ghost" onClick={() => void changePaid(item, 1)} disabled={done} aria-label={`Add one paid month for ${item.name}`}>
                    +1 month paid
                  </button>
                  <button type="button" className="ghost" onClick={() => void removeItem(item.id)} aria-label={`Remove ${item.name}`}>
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
          <div className="item-totals mono">
            <span>Due every month: {peso.format(totals.monthly)}</span>
            <span>Total left to pay: {peso.format(totals.remaining)}</span>
          </div>
        </>
      )}
    </section>
  )
}
