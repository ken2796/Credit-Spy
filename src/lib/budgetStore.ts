import type { SupabaseClient } from '@supabase/supabase-js'

/** A spending category with a monthly limit. */
export interface Budget {
  id: string
  name: string
  limit: number
}

export interface BudgetStore {
  list(): Promise<Budget[]>
  add(name: string, limit: number): Promise<Budget>
  setLimit(id: string, limit: number): Promise<void>
  remove(id: string): Promise<void>
}

const STORAGE_KEY = 'credit-spy.budgets'

function readLocal(): Budget[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as Budget[]) : []
  } catch {
    return []
  }
}

function writeLocal(list: Budget[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Storage unavailable: changes last for this visit only.
  }
}

/** Fallback used until Supabase is configured. */
export const localBudgetStore: BudgetStore = {
  async list() {
    return readLocal()
  },
  async add(name, limit) {
    if (readLocal().some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`There is already a budget called ${name}.`)
    }
    const created = { id: crypto.randomUUID(), name, limit }
    writeLocal([...readLocal(), created])
    return created
  },
  async setLimit(id, limit) {
    writeLocal(readLocal().map((b) => (b.id === id ? { ...b, limit } : b)))
  },
  async remove(id) {
    writeLocal(readLocal().filter((b) => b.id !== id))
  },
}

interface Row {
  id: string
  name: string
  monthly_limit: number | string
}

function fromRow(row: Row): Budget {
  return { id: row.id, name: row.name, limit: Number(row.monthly_limit) }
}

/** Budgets belong to a spy; row level security lets only its members in (supabase/budgets.sql). */
export function supabaseBudgetStore(client: SupabaseClient, spyId: string): BudgetStore {
  const table = () => client.from('budgets')
  return {
    async list() {
      const { data, error } = await table().select('id, name, monthly_limit').eq('spy_id', spyId).order('created_at')
      if (error) throw new Error(error.message)
      return (data as Row[]).map(fromRow)
    },
    async add(name, limit) {
      const { data, error } = await table()
        .insert({ spy_id: spyId, name, monthly_limit: limit })
        .select('id, name, monthly_limit')
        .single()
      if (error) {
        throw new Error(error.code === '23505' ? `There is already a budget called ${name}.` : error.message)
      }
      return fromRow(data as Row)
    },
    async setLimit(id, limit) {
      const { error } = await table().update({ monthly_limit: limit }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    async remove(id) {
      const { error } = await table().delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
  }
}
