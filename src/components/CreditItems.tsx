import { useCallback, useEffect, useMemo, useState } from 'react'
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
import type { ItemStore } from '../lib/itemStore'
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
import { ItemList } from './ItemList'
import type { MemberCredit } from './ItemList'

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
  const [memberCredit, setMemberCredit] = useState<MemberCredit[]>([])
  const reportMemberCredit = useCallback((credit: MemberCredit[]) => setMemberCredit(credit), [])

  const [monthlyDues, setMonthlyDues] = useState(0)
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

  // "Income" on Home is the money actually recorded as coming in this month, not the planned salary in Setup.
  const monthlyIncome = memberMonth.reduce((sum, g) => sum + g.moneyIn, 0)
  const left = monthlyIncome - monthlyDues

  // One row per member: their money in and out this month, and the credit they owe.
  const memberRows = memberMonth.map((g) => {
    const credit = memberCredit.find((c) => c.key === g.key)
    return { key: g.key, name: g.name, moneyIn: g.moneyIn, moneyOut: g.moneyOut, creditMonthly: credit?.monthly ?? 0, creditLeft: credit?.remaining ?? 0 }
  })
  for (const c of memberCredit) {
    if (memberRows.some((r) => r.key === c.key)) continue
    memberRows.push({ key: c.key, name: c.key ? 'Former member' : 'Not assigned', moneyIn: 0, moneyOut: 0, creditMonthly: c.monthly, creditLeft: c.remaining })
  }
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
              <span className="muted small">Money in</span>
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
              `Credit dues take ${Math.round((monthlyDues / monthlyIncome) * 100)}% of the money that came in this month.`
            ) : (
              'Record money in under Members’ money below to see how much is left after your credit dues.'
            )}
          </div>
          {memberRows.length > 1 && (
            <div className="member-summary">
              <div className="strong small">Each member this month</div>
              {memberRows.map((r) => (
                <div key={r.key} className="member-summary-row small">
                  <span className="strong">
                    {r.name}
                    {r.key !== '' && r.key === userId ? <span className="muted"> (you)</span> : null}
                  </span>
                  <span className="mono member-summary-numbers">
                    <span>
                      <span className="money-in">In {peso.format(r.moneyIn)}</span>
                      <span className="money-out">Out {peso.format(r.moneyOut)}</span>
                    </span>
                    <span>
                      <span>Credit {peso.format(r.creditMonthly)}/mo</span>
                      <span className="muted">{peso.format(r.creditLeft)} left to pay</span>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {/* These stay mounted on every tab so Home's totals are always current; each renders the part for this tab. */}
      <IncomeList key={`income-${key}`} tab={tab} store={incomeStore ?? localIncomeStore} />
      <ItemList
        key={`items-${key}`}
        tab={tab}
        store={store ?? localStore}
        people={people}
        meId={userId ?? null}
        onMonthlyDue={reportDues}
        onMemberCredit={reportMemberCredit}
      />
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
