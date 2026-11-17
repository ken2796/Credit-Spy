import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { peso } from '../lib/format'
import { localIncomeStore, supabaseIncomeStore } from '../lib/incomeStore'
import type { IncomeStore } from '../lib/incomeStore'
import { localStore, supabaseStore } from '../lib/itemStore'
import { localBudgetStore, supabaseBudgetStore } from '../lib/budgetStore'
import type { BudgetStore } from '../lib/budgetStore'
import { localSavingsStore, supabaseSavingsStore } from '../lib/savingsStore'
import type { SavingsStore } from '../lib/savingsStore'
import { localTransactionStore, supabaseTransactionStore } from '../lib/transactionStore'
import type { TransactionStore } from '../lib/transactionStore'
import type { CreditItem, ItemStore } from '../lib/itemStore'
import { clearJoinCode, listMembers, loadMySpies, readCurrentSpy, readJoinCode, rememberCurrentSpy } from '../lib/spy'
import type { Spy, SpyMember } from '../lib/spy'
import type { MemberMoney, Person } from '../lib/memberMoney'
import { supabase } from '../lib/supabase'
import type { Tab } from '../lib/tabs'
import { AuthForm } from './AuthForm'
import { CashFlow } from './CashFlow'
import { JoinPrompt } from './JoinPrompt'
import { Savings } from './Savings'
import { SpyPanel } from './SpyPanel'
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

/** Picks where money data lives: a shared spy in Supabase when configured (sign-in required), otherwise this browser. */
export function CreditItems({ tab, refreshTick }: { tab: Tab; refreshTick: number }) {
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
  const [spies, setSpies] = useState<Spy[] | null>(null)
  const [spyId, setSpyId] = useState<string | null>(null)
  const [spyError, setSpyError] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState(readJoinCode)

  const refreshSpies = useCallback(async (prefer?: string) => {
    if (!supabase) return
    setSpyError(null)
    try {
      const list = await loadMySpies(supabase)
      const wanted = prefer ?? readCurrentSpy()
      const pick = list.find((s) => s.id === wanted) ?? list[0]
      setSpies(list)
      setSpyId(pick?.id ?? null)
      if (pick) rememberCurrentSpy(pick.id)
    } catch (e) {
      setSpyError(errorText(e))
    }
  }, [])

  useEffect(() => {
    if (userId) void refreshSpies()
  }, [userId, refreshSpies])

  // On refresh, also reload the spy list so names and member counts are current.
  useEffect(() => {
    if (refreshTick > 0 && userId) void refreshSpies()
  }, [refreshTick, userId, refreshSpies])

  function switchSpy(id: string) {
    rememberCurrentSpy(id)
    setSpyId(id)
  }

  function dismissJoin() {
    clearJoinCode()
    setJoinCode(null)
  }

  function joined(id: string) {
    dismissJoin()
    void refreshSpies(id)
  }

  const activeSpy = userId ? (spies?.find((s) => s.id === spyId) ?? null) : null
  const activeId = activeSpy?.id ?? null

  const store = useMemo<ItemStore | null>(() => {
    if (!supabase) return localStore
    return activeId ? supabaseStore(supabase, activeId) : null
  }, [activeId])
  const incomeStore = useMemo<IncomeStore | null>(() => {
    if (!supabase) return localIncomeStore
    return activeId ? supabaseIncomeStore(supabase, activeId) : null
  }, [activeId])
  const transactionStore = useMemo<TransactionStore | null>(() => {
    if (!supabase) return localTransactionStore
    return activeId ? supabaseTransactionStore(supabase, activeId) : null
  }, [activeId])
  const budgetStore = useMemo<BudgetStore | null>(() => {
    if (!supabase) return localBudgetStore
    return activeId ? supabaseBudgetStore(supabase, activeId) : null
  }, [activeId])
  const savingsStore = useMemo<SavingsStore | null>(() => {
    if (!supabase) return localSavingsStore
    return activeId ? supabaseSavingsStore(supabase, activeId) : null
  }, [activeId])

  const [members, setMembers] = useState<SpyMember[]>([])
  useEffect(() => {
    if (!supabase || !activeId) return
    let cancelled = false
    listMembers(supabase, activeId)
      .then((list) => !cancelled && setMembers(list))
      // Without the member list, entries still show, grouped as former members.
      .catch(() => !cancelled && setMembers([]))
    return () => {
      cancelled = true
    }
  }, [activeId, refreshTick])
  const people = useMemo<Person[]>(
    () => (supabase ? members.map((m) => ({ id: m.userId, name: m.name || m.email })) : [{ id: null, name: 'You' }]),
    [members],
  )
  const [memberMonth, setMemberMonth] = useState<MemberMoney[]>([])
  const reportMemberMonth = useCallback((groups: MemberMoney[]) => setMemberMonth(groups), [])

  const [monthlyIncome, setMonthlyIncome] = useState(0)
  const [monthlyDues, setMonthlyDues] = useState(0)
  const reportIncome = useCallback((total: number) => setMonthlyIncome(total), [])
  const reportDues = useCallback((total: number) => setMonthlyDues(total), [])
  const [totalSaved, setTotalSaved] = useState(0)
  const reportSaved = useCallback((total: number) => setTotalSaved(total), [])

  if (!ready) {
    return (
      <section id="items" className="card">
        <h2>Credit Spy</h2>
        <div className="muted">Loading…</div>
      </section>
    )
  }

  if (supabase && !session) {
    return (
      <section id="items" className="card">
        <h2>Sign in</h2>
        {joinCode && <p className="item-preview small">You opened a spy invite. Sign in first, then you can accept it.</p>}
        <AuthForm client={supabase} />
      </section>
    )
  }

  if (supabase && (!activeSpy || !store || !incomeStore || !transactionStore || !savingsStore || !budgetStore)) {
    return (
      <section id="items" className="card">
        <h2>Credit Spy</h2>
        {spyError ? (
          <>
            <div className="error small" role="alert">
              {spyError}
            </div>
            <div className="item-actions">
              <button type="button" className="ghost" onClick={() => void refreshSpies()}>
                Try again
              </button>
            </div>
          </>
        ) : (
          <div className="muted">Loading your spy…</div>
        )}
      </section>
    )
  }

  const left = monthlyIncome - monthlyDues
  // A new key on refresh remounts each section, so each one loads its data again.
  const key = `${activeId ?? 'local'}-${refreshTick}`

  return (
    <>
      {supabase && joinCode && <JoinPrompt client={supabase} code={joinCode} onJoined={joined} onDismiss={dismissJoin} />}
      {tab === 'home' && (
        <section id="budget" className="card">
          <div className="card-head">
            <h2>This month{activeSpy ? ` · ${activeSpy.name}` : ''}</h2>
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
            <div className="budget-stat">
              <span className="muted small">Total savings</span>
              <span className="budget-value mono money-in">{peso.format(totalSaved)}</span>
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
            {monthlyIncome > 0 ? (
              `Credit dues take ${Math.round((monthlyDues / monthlyIncome) * 100)}% of the monthly income.`
            ) : (
              <>
                Add your income in <a href="#setup">Setup</a> to see how much is left after your credit dues.
              </>
            )}
          </div>
          {memberMonth.length > 1 && (
            <div className="member-summary">
              <div className="strong small">Each member this month</div>
              {memberMonth.map((g) => (
                <div key={g.key} className="member-summary-row small">
                  <span className="strong">
                    {g.name}
                    {g.key !== '' && g.key === userId ? <span className="muted"> (you)</span> : null}
                  </span>
                  <span className="mono">
                    <span className="money-in">In {peso.format(g.moneyIn)}</span>
                    <span className="money-out">Out {peso.format(g.moneyOut)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {/* These stay mounted on every tab so Home's totals are always current; each renders the part for this tab. */}
      <IncomeList key={`income-${key}`} tab={tab} store={incomeStore ?? localIncomeStore} onMonthlyTotal={reportIncome} />
      <ItemList key={`items-${key}`} tab={tab} store={store ?? localStore} onMonthlyDue={reportDues} />
      <Savings key={`savings-${key}`} tab={tab} store={savingsStore ?? localSavingsStore} onTotalSaved={reportSaved} />
      <CashFlow
        key={`cash-${key}`}
        tab={tab}
        store={transactionStore ?? localTransactionStore}
        budgetStore={budgetStore ?? localBudgetStore}
        people={people}
        meId={userId ?? null}
        onThisMonth={reportMemberMonth}
      />
      {tab === 'profile' && (
        <section id="account" className="card">
          <h2>Account</h2>
          {supabase && session ? (
            <div className="account-row">
              <span className="muted small">Signed in as {session.user.email}</span>
              <button type="button" className="ghost" onClick={() => void supabase?.auth.signOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <div className="muted small">Your data is saved in this browser only. Sign-in and shared members need Supabase to be set up.</div>
          )}
        </section>
      )}
      {tab === 'profile' && supabase && activeSpy && userId && spies && (
        <SpyPanel
          key={`spy-${key}`}
          client={supabase}
          spy={activeSpy}
          spies={spies}
          userId={userId}
          onSwitch={switchSpy}
          onLeft={() => void refreshSpies()}
        />
      )}
    </>
  )
}

interface ItemListProps {
  tab: Tab
  store: ItemStore
  /** Reports the total due every month whenever the list changes. */
  onMonthlyDue: (total: number) => void
}

function ItemList({ tab, store, onMonthlyDue }: ItemListProps) {
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

  if (tab === 'profile') return null
  const setup = tab === 'setup'

  return (
    <section id="items" className="card">
      <div className="card-head">
        <h2>Credit items</h2>
        <span className="mono muted small">
          {items.length} {items.length === 1 ? 'item' : 'items'} · {store.label}
        </span>
      </div>

      {setup && (
        <>
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
        </>
      )}

      {error && (
        <div className="error small" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty muted">Loading items…</div>
      ) : items.length === 0 ? (
        <div className="empty muted">
          {setup ? (
            'No credit items yet. Add the first one above.'
          ) : (
            <>
              No credit items yet. Add them in <a href="#setup">Setup</a>.
            </>
          )}
        </div>
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
                {setup ? (
                  <div className="item-actions">
                    <button type="button" className="ghost" onClick={() => void removeItem(item.id)} aria-label={`Remove ${item.name}`}>
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="item-actions">
                    <button type="button" className="ghost" onClick={() => void changePaid(item, -1)} disabled={item.monthsPaid === 0} aria-label={`Undo one paid month for ${item.name}`}>
                      −1
                    </button>
                    <button type="button" className="ghost" onClick={() => void changePaid(item, 1)} disabled={done} aria-label={`Add one paid month for ${item.name}`}>
                      +1 month paid
                    </button>
                  </div>
                )}
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
