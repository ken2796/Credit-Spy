import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { peso } from '../lib/format'
import { FREQUENCIES, frequencyLabel, monthlyAmount } from '../lib/incomeStore'
import type { Frequency, Income, IncomeStore } from '../lib/incomeStore'
import type { Tab } from '../lib/tabs'

interface Props {
  tab: Tab
  store: IncomeStore
  /** Reports the total monthly income whenever the list changes. */
  onMonthlyTotal: (total: number) => void
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

/** Income sources are set up on the Setup tab; Home only shows their monthly total. */
export function IncomeList({ tab, store, onMonthlyTotal }: Props) {
  const [incomes, setIncomes] = useState<Income[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('monthly')

  useEffect(() => {
    let cancelled = false
    store
      .list()
      .then((list) => !cancelled && setIncomes(list))
      .catch((e: unknown) => !cancelled && setError(errorText(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [store])

  const total = incomes.reduce((sum, i) => sum + monthlyAmount(i), 0)

  useEffect(() => {
    onMonthlyTotal(total)
  }, [total, onMonthlyTotal])

  const amountValue = Number(amount)
  const valid = name.trim() !== '' && amountValue > 0

  async function addIncome(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    setError(null)
    try {
      const created = await store.add({ name: name.trim(), amount: amountValue, frequency })
      setIncomes((list) => [...list, created])
      setName('')
      setAmount('')
      setFrequency('monthly')
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function removeIncome(id: string) {
    setError(null)
    try {
      await store.remove(id)
      setIncomes((list) => list.filter((i) => i.id !== id))
    } catch (e) {
      setError(errorText(e))
    }
  }

  if (tab !== 'setup') return null

  return (
    <section id="income" className="card">
      <div className="card-head">
        <h2>Income</h2>
        <span className="mono muted small">
          {incomes.length} {incomes.length === 1 ? 'source' : 'sources'} · {peso.format(total)} a month
        </span>
      </div>

      <form className="item-form" onSubmit={addIncome}>
        <label className="field field-wide">
          <span>Source</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Salary, Freelance" maxLength={120} required />
        </label>
        <label className="field">
          <span>Amount (₱)</span>
          <input type="number" inputMode="decimal" min="1" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25000" required />
        </label>
        <label className="field">
          <span>How often</span>
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="primary" disabled={!valid}>
          Add income
        </button>
      </form>

      {valid && frequency !== 'monthly' && (
        <div className="item-preview mono small" aria-live="polite">
          About {peso.format(monthlyAmount({ amount: amountValue, frequency }))} a month
        </div>
      )}

      {error && (
        <div className="error small" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty muted">Loading income…</div>
      ) : incomes.length === 0 ? (
        <div className="empty muted">No income yet. Add each source of money you receive.</div>
      ) : (
        incomes.map((income) => (
          <div key={income.id} className="item-row">
            <div className="item-main">
              <div className="strong">{income.name}</div>
              <div className="muted small">
                {peso.format(income.amount)} · {frequencyLabel(income.frequency)}
              </div>
            </div>
            <div className="item-numbers mono">
              <div>{peso.format(monthlyAmount(income))}</div>
              <div className="muted small">per month</div>
            </div>
            <div className="item-actions">
              <button type="button" className="ghost" onClick={() => void removeIncome(income.id)} aria-label={`Remove ${income.name}`}>
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  )
}
