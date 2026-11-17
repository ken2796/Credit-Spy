import type { SupabaseClient } from '@supabase/supabase-js'

export interface CreditItem {
  id: string
  name: string
  total: number
  termMonths: number
  monthsPaid: number
  /** The spy member who owes this (their user id), or null when not tied to anyone. */
  memberId: string | null
}

export type NewCreditItem = Omit<CreditItem, 'id'>

export interface ItemStore {
  /** Shown beside the item count, e.g. "saved on this device" */
  label: string
  list(): Promise<CreditItem[]>
  add(item: NewCreditItem): Promise<CreditItem>
  setMonthsPaid(id: string, monthsPaid: number): Promise<void>
  /** Replaces every editable field of an item. */
  update(id: string, item: NewCreditItem): Promise<void>
  remove(id: string): Promise<void>
}

const STORAGE_KEY = 'credit-spy.items'

function readLocal(): CreditItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as CreditItem[]) : []
  } catch {
    return []
  }
}

function writeLocal(items: CreditItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Storage unavailable (private window): changes last for this visit only.
  }
}

/** Fallback used until Supabase is configured. */
export const localStore: ItemStore = {
  label: 'saved on this device',
  async list() {
    return readLocal().map((item) => ({ ...item, memberId: item.memberId ?? null }))
  },
  async add(item) {
    const created = { ...item, id: crypto.randomUUID() }
    writeLocal([...readLocal(), created])
    return created
  },
  async setMonthsPaid(id, monthsPaid) {
    writeLocal(readLocal().map((item) => (item.id === id ? { ...item, monthsPaid } : item)))
  },
  async update(id, changes) {
    writeLocal(readLocal().map((item) => (item.id === id ? { ...changes, id } : item)))
  },
  async remove(id) {
    writeLocal(readLocal().filter((item) => item.id !== id))
  },
}

interface Row {
  id: string
  name: string
  total: number | string
  term_months: number
  months_paid: number
  user_id: string | null
}

const COLUMNS = 'id, name, total, term_months, months_paid, user_id'

function fromRow(row: Row): CreditItem {
  return {
    id: row.id,
    name: row.name,
    total: Number(row.total),
    termMonths: row.term_months,
    monthsPaid: row.months_paid,
    memberId: row.user_id,
  }
}

/** Rows belong to a spy; row level security lets only its members in (supabase/spies.sql). */
export function supabaseStore(client: SupabaseClient, spyId: string): ItemStore {
  const table = () => client.from('credit_items')
  return {
    label: 'shared in this spy',
    async list() {
      const { data, error } = await table().select(COLUMNS).eq('spy_id', spyId).order('created_at')
      if (error) throw new Error(error.message)
      return (data as Row[]).map(fromRow)
    },
    async add(item) {
      const { data, error } = await table()
        .insert({
          spy_id: spyId,
          name: item.name,
          total: item.total,
          term_months: item.termMonths,
          months_paid: item.monthsPaid,
          // Left out, the database fills in whoever is signed in.
          ...(item.memberId ? { user_id: item.memberId } : {}),
        })
        .select(COLUMNS)
        .single()
      if (error) throw new Error(error.message)
      return fromRow(data as Row)
    },
    async setMonthsPaid(id, monthsPaid) {
      const { error } = await table().update({ months_paid: monthsPaid }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    async update(id, item) {
      const { error } = await table()
        .update({
          name: item.name,
          total: item.total,
          term_months: item.termMonths,
          months_paid: item.monthsPaid,
          ...(item.memberId ? { user_id: item.memberId } : {}),
        })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },
    async remove(id) {
      const { error } = await table().delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
  }
}
