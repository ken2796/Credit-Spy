import type { SupabaseClient } from '@supabase/supabase-js'

export type Frequency = 'monthly' | 'semi-monthly' | 'biweekly' | 'weekly' | 'yearly'

export const FREQUENCIES: { value: Frequency; label: string; perMonth: number }[] = [
  { value: 'monthly', label: 'Monthly', perMonth: 1 },
  { value: 'semi-monthly', label: 'Twice a month', perMonth: 2 },
  { value: 'biweekly', label: 'Every 2 weeks', perMonth: 26 / 12 },
  { value: 'weekly', label: 'Weekly', perMonth: 52 / 12 },
  { value: 'yearly', label: 'Yearly', perMonth: 1 / 12 },
]

export function frequencyLabel(frequency: Frequency): string {
  return FREQUENCIES.find((f) => f.value === frequency)?.label ?? frequency
}

/** The amount turned into what it adds up to in an average month. */
export function monthlyAmount(income: Pick<Income, 'amount' | 'frequency'>): number {
  const perMonth = FREQUENCIES.find((f) => f.value === income.frequency)?.perMonth ?? 1
  return income.amount * perMonth
}

export interface Income {
  id: string
  name: string
  amount: number
  frequency: Frequency
}

export type NewIncome = Omit<Income, 'id'>

export interface IncomeStore {
  list(): Promise<Income[]>
  add(income: NewIncome): Promise<Income>
  remove(id: string): Promise<void>
}

const STORAGE_KEY = 'credit-spy.income'

function readLocal(): Income[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as Income[]) : []
  } catch {
    return []
  }
}

function writeLocal(list: Income[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Storage unavailable: changes last for this visit only.
  }
}

/** Fallback used until Supabase is configured. */
export const localIncomeStore: IncomeStore = {
  async list() {
    return readLocal()
  },
  async add(income) {
    const created = { ...income, id: crypto.randomUUID() }
    writeLocal([...readLocal(), created])
    return created
  },
  async remove(id) {
    writeLocal(readLocal().filter((i) => i.id !== id))
  },
}

interface Row {
  id: string
  name: string
  amount: number | string
  frequency: Frequency
}

const COLUMNS = 'id, name, amount, frequency'

function fromRow(row: Row): Income {
  return { id: row.id, name: row.name, amount: Number(row.amount), frequency: row.frequency }
}

/** Rows belong to a spy; row level security lets only its members in (supabase/spies.sql). */
export function supabaseIncomeStore(client: SupabaseClient, spyId: string): IncomeStore {
  const table = () => client.from('income_sources')
  return {
    async list() {
      const { data, error } = await table().select(COLUMNS).eq('spy_id', spyId).order('created_at')
      if (error) throw new Error(error.message)
      return (data as Row[]).map(fromRow)
    },
    async add(income) {
      const { data, error } = await table()
        .insert({ spy_id: spyId, name: income.name, amount: income.amount, frequency: income.frequency })
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
