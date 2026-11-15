import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { peso } from '../data'

interface CreditItem {
  id: string
  name: string
  total: number
  termMonths: number
  monthsPaid: number
}

type TermUnit = 'months' | 'years'

const STORAGE_KEY = 'credit-spy.items'

function loadItems(): CreditItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as CreditItem[]) : []
  } catch {
    return []
  }
}

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

export function CreditItems() {
  const [items, setItems] = useState<CreditItem[]>(loadItems)
  const [name, setName] = useState('')
  const [total, setTotal] = useState('')
  const [term, setTerm] = useState('')
  const [unit, setUnit] = useState<TermUnit>('months')
  const [monthsPaid, setMonthsPaid] = useState('0')

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Storage unavailable (private window): the list still works for this visit.
    }
  }, [items])

  const totalValue = Number(total)
  const termMonths = Math.round(Number(term) * (unit === 'years' ? 12 : 1))
  const paidValue = Math.min(Math.max(0, Math.round(Number(monthsPaid) || 0)), Math.max(termMonths, 0))
  const valid = name.trim() !== '' && totalValue > 0 && termMonths >= 1
  const preview = totalValue > 0 && termMonths >= 1 ? compute({ total: totalValue, termMonths, monthsPaid: paidValue }) : null

  function addItem(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    setItems((list) => [
      ...list,
      { id: crypto.randomUUID(), name: name.trim(), total: totalValue, termMonths, monthsPaid: paidValue },
    ])
    setName('')
    setTotal('')
    setTerm('')
    setMonthsPaid('0')
  }

  function changePaid(id: string, delta: number) {
    setItems((list) =>
      list.map((item) =>
        item.id === id
          ? { ...item, monthsPaid: Math.min(item.termMonths, Math.max(0, item.monthsPaid + delta)) }
          : item,
      ),
    )
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

  return (
    <section id="items" className="card">
      <div className="card-head">
        <h2>Credit items</h2>
        <span className="mono muted small">
          {items.length} {items.length === 1 ? 'item' : 'items'} · saved on this device
        </span>
      </div>

      <form className="item-form" onSubmit={addItem}>
        <label className="field field-wide">
          <span>Item</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Laptop" required />
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

      {items.length === 0 ? (
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
                  <button type="button" className="ghost" onClick={() => changePaid(item.id, -1)} disabled={item.monthsPaid === 0} aria-label={`Undo one paid month for ${item.name}`}>
                    −1
                  </button>
                  <button type="button" className="ghost" onClick={() => changePaid(item.id, 1)} disabled={done} aria-label={`Add one paid month for ${item.name}`}>
                    +1 month paid
                  </button>
                  <button type="button" className="ghost" onClick={() => setItems((list) => list.filter((i) => i.id !== item.id))} aria-label={`Remove ${item.name}`}>
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
