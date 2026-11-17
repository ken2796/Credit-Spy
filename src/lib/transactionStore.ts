import type { SupabaseClient } from '@supabase/supabase-js'

export type Kind = 'in' | 'out'

export interface Transaction {
  id: string
  kind: Kind
  description: string
  amount: number
  /** YYYY-MM-DD */
  date: string
  /** Budget category name for money out, or null. */
  category: string | null
  /** The spy member whose money this is (their user id), or null when not tied to anyone. */
  memberId: string | null
}

export type NewTransaction = Omit<Transaction, 'id'>

export interface TransactionStore {
  list(): Promise<Transaction[]>
  add(transaction: NewTransaction): Promise<Transaction>
  remove(id: string): Promise<void>
}

/** Today's date as YYYY-MM-DD in the viewer's own time zone. */
export function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function newestFirst(a: Transaction, b: Transaction) {
  return b.date.localeCompare(a.date)
}

const STORAGE_KEY = 'credit-spy.transactions'

function readLocal(): Transaction[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as Transaction[]) : []
  } catch {
    return []
  }
}

function writeLocal(list: Transaction[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Storage unavailable: changes last for this visit only.
  }
}

/** Fallback used until Supabase is configured. */
export const localTransactionStore: TransactionStore = {
  async list() {
    return readLocal()
      .map((t) => ({ ...t, memberId: t.memberId ?? null }))
      .sort(newestFirst)
  },
  async add(transaction) {
    const created = { ...transaction, id: crypto.randomUUID() }
    writeLocal([...readLocal(), created])
    return created
  },
  async remove(id) {
    writeLocal(readLocal().filter((t) => t.id !== id))
  },
}

interface Row {
  id: string
  kind: Kind
  description: string
  amount: number | string
  occurred_on: string
  category: string | null
  user_id: string | null
}

const COLUMNS = 'id, kind, description, amount, occurred_on, category, user_id'

function fromRow(row: Row): Transaction {
  return {
    id: row.id,
    kind: row.kind,
    description: row.description,
    amount: Number(row.amount),
    date: row.occurred_on,
    category: row.category,
    memberId: row.user_id,
  }
}

/** Rows belong to a spy; row level security lets only its members in (supabase/spies.sql). */
export function supabaseTransactionStore(client: SupabaseClient, spyId: string): TransactionStore {
  const table = () => client.from('transactions')
  return {
    async list() {
      const { data, error } = await table()
        .select(COLUMNS)
        .eq('spy_id', spyId)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data as Row[]).map(fromRow)
    },
    async add(t) {
      const { data, error } = await table()
        .insert({
          spy_id: spyId,
          kind: t.kind,
          description: t.description,
          amount: t.amount,
          occurred_on: t.date,
          category: t.category,
          // Left out, the database fills in whoever is signed in.
          ...(t.memberId ? { user_id: t.memberId } : {}),
        })
        .select(COLUMNS)
        .single()
      if (error) throw new Error(error.message)
      return fromRow(data as Row)
    },
    async remove(id) {
      const { error } = await table().delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
  }
}
