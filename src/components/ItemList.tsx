import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { peso } from '../lib/format'
import type { CreditItem, ItemStore, NewCreditItem } from '../lib/itemStore'
import type { Person } from '../lib/memberMoney'
import type { Tab } from '../lib/tabs'

type TermUnit = 'months' | 'years'

/** Credit owed by one member: what is due each month and what is left to pay. */
export interface MemberCredit {
  /** User id, or '' for items not tied to anyone. */
  key: string
  monthly: number
  remaining: number
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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

/** Reads the form's text fields into an item, or null if something is missing. */
function parseItem(fields: { name: string; total: string; term: string; unit: TermUnit; monthsPaid: string }, memberId: string | null): NewCreditItem | null {
  const total = Number(fields.total)
  const termMonths = Math.round(Number(fields.term) * (fields.unit === 'years' ? 12 : 1))
  if (fields.name.trim() === '' || !(total > 0) || !(termMonths >= 1)) return null
  const monthsPaid = Math.min(Math.max(0, Math.round(Number(fields.monthsPaid) || 0)), termMonths)
  return { name: fields.name.trim(), total, termMonths, monthsPaid, memberId }
}

interface ItemListProps {
  tab: Tab
  store: ItemStore
  people: Person[]
  meId: string | null
  /** Reports the total due every month whenever the list changes. */
  onMonthlyDue: (total: number) => void
  /** Reports each member's credit whenever the list changes. */
  onMemberCredit: (credit: MemberCredit[]) => void
}

/** Credit items: added and edited on Setup, paid month by month on Home. */
export function ItemList({ tab, store, people, meId, onMonthlyDue, onMemberCredit }: ItemListProps) {
  const [items, setItems] = useState<CreditItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [total, setTotal] = useState('')
  const [term, setTerm] = useState('')
  const [unit, setUnit] = useState<TermUnit>('months')
  const [monthsPaid, setMonthsPaid] = useState('0')
  const [memberId, setMemberId] = useState<string>(meId ?? '')
  const [editing, setEditing] = useState<string | null>(null)

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

  const nameOf = (id: string | null) => {
    const person = people.find((p) => (p.id ?? '') === (id ?? ''))
    if (person) return person.name
    return id ? 'Former member' : 'Not assigned'
  }
  const showMembers = people.length > 1
  // Fall back to the first person if the chosen one is no longer listed.
  const chosen = people.find((p) => (p.id ?? '') === memberId) ?? people[0]

  const draft = parseItem({ name, total, term, unit, monthsPaid }, chosen?.id ?? null)
  const preview = Number(total) > 0 && Number(term) >= 1 ? compute({ total: Number(total), termMonths: Math.round(Number(term) * (unit === 'years' ? 12 : 1)), monthsPaid: draft?.monthsPaid ?? 0 }) : null

  async function addItem(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    setError(null)
    try {
      const created = await store.add(draft)
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

  async function saveItem(id: string, changes: NewCreditItem): Promise<boolean> {
    setError(null)
    try {
      await store.update(id, changes)
      setItems((list) => list.map((i) => (i.id === id ? { ...changes, id } : i)))
      setEditing(null)
      return true
    } catch (e) {
      setError(errorText(e))
      return false
    }
  }

  async function removeItem(item: CreditItem) {
    if (!window.confirm(`Remove ${item.name}?`)) return
    setError(null)
    try {
      await store.remove(item.id)
      setItems((list) => list.filter((i) => i.id !== item.id))
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

  const byMember = useMemo<MemberCredit[]>(() => {
    const map = new Map<string, MemberCredit>()
    for (const item of items) {
      const key = item.memberId ?? ''
      const c = compute(item)
      const entry = map.get(key) ?? { key, monthly: 0, remaining: 0 }
      entry.monthly += c.monthsLeft > 0 ? c.monthly : 0
      entry.remaining += c.remaining
      map.set(key, entry)
    }
    return [...map.values()]
  }, [items])

  useEffect(() => {
    onMonthlyDue(totals.monthly)
  }, [totals.monthly, onMonthlyDue])

  useEffect(() => {
    onMemberCredit(byMember)
  }, [byMember, onMemberCredit])

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
            {showMembers && (
              <label className="field field-wide">
                <span>Whose credit</span>
                <select value={chosen?.id ?? ''} onChange={(e) => setMemberId(e.target.value)}>
                  {people.map((p) => (
                    <option key={p.id ?? ''} value={p.id ?? ''}>
                      {p.name}
                      {p.id === meId ? ' (you)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
              <input type="number" inputMode="numeric" min="0" step="1" value={monthsPaid} onChange={(e) => setMonthsPaid(e.target.value)} />
            </label>
            <button type="submit" className="primary" disabled={!draft}>
              Add item
            </button>
          </form>

          <div className="item-preview mono small" aria-live="polite">
            {preview && draft
              ? `Auto-computed: ${peso.format(preview.monthly)} per month · ${peso.format(preview.paid)} paid · ${peso.format(preview.remaining)} left · ${preview.monthsLeft} of ${draft.termMonths} months to go`
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
            if (setup && editing === item.id) {
              return (
                <EditItem
                  key={item.id}
                  item={item}
                  people={people}
                  meId={meId}
                  onSave={(changes) => saveItem(item.id, changes)}
                  onCancel={() => setEditing(null)}
                />
              )
            }
            const c = compute(item)
            const done = c.monthsLeft === 0
            return (
              <div key={item.id} className="item-row">
                <div className="item-main">
                  <div className="strong">
                    {item.name} {done && <span className="tag tag-info mono">PAID OFF</span>}
                  </div>
                  <div className="muted small">
                    {showMembers || item.memberId ? `${nameOf(item.memberId)} · ` : ''}
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
                    <button type="button" className="ghost" onClick={() => setEditing(item.id)} aria-label={`Edit ${item.name}`}>
                      Edit
                    </button>
                    <button type="button" className="ghost" onClick={() => void removeItem(item)} aria-label={`Remove ${item.name}`}>
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

interface EditItemProps {
  item: CreditItem
  people: Person[]
  meId: string | null
  onSave: (changes: NewCreditItem) => Promise<boolean>
  onCancel: () => void
}

function EditItem({ item, people, meId, onSave, onCancel }: EditItemProps) {
  const [name, setName] = useState(item.name)
  const [total, setTotal] = useState(String(item.total))
  const [term, setTerm] = useState(String(item.termMonths))
  const [monthsPaid, setMonthsPaid] = useState(String(item.monthsPaid))
  const [memberId, setMemberId] = useState(item.memberId ?? '')
  const [busy, setBusy] = useState(false)

  // Keep a former member's item with them unless someone else is picked.
  const listed = people.some((p) => (p.id ?? '') === memberId)
  const changes = parseItem({ name, total, term, unit: 'months', monthsPaid }, memberId || null)
  const preview = changes ? compute(changes) : null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!changes) return
    setBusy(true)
    await onSave(changes)
    setBusy(false)
  }

  return (
    <form className="item-form item-edit" onSubmit={submit} aria-label={`Edit ${item.name}`}>
      {people.length > 1 && (
        <label className="field field-wide">
          <span>Whose credit</span>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {!listed && <option value={memberId}>{memberId ? 'Former member' : 'Not assigned'}</option>}
            {people.map((p) => (
              <option key={p.id ?? ''} value={p.id ?? ''}>
                {p.name}
                {p.id === meId ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field field-wide">
        <span>Item</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus />
      </label>
      <label className="field">
        <span>Total amount (₱)</span>
        <input type="number" inputMode="decimal" min="1" step="any" value={total} onChange={(e) => setTotal(e.target.value)} required />
      </label>
      <label className="field field-narrow">
        <span>Term (months)</span>
        <input type="number" inputMode="numeric" min="1" step="1" value={term} onChange={(e) => setTerm(e.target.value)} required />
      </label>
      <label className="field field-narrow">
        <span>Months paid</span>
        <input type="number" inputMode="numeric" min="0" step="1" value={monthsPaid} onChange={(e) => setMonthsPaid(e.target.value)} />
      </label>
      <div className="item-preview mono small field-wide" aria-live="polite">
        {preview && changes
          ? `${peso.format(preview.monthly)} per month · ${peso.format(preview.remaining)} left · ${preview.monthsLeft} of ${changes.termMonths} months to go`
          : 'Enter the amount and term.'}
      </div>
      <div className="item-actions">
        <button type="submit" className="primary" disabled={!changes || busy}>
          Save
        </button>
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
