import type { SupabaseClient } from '@supabase/supabase-js'

export interface SavingsEntry {
  id: string
  goalId: string
  /** Positive for money put in, negative for money taken out. */
  amount: number
  /** YYYY-MM-DD */
  date: string
}

export interface SavingsGoal {
  id: string
  name: string
  target: number
  /** YYYY-MM-DD, or null when there is no deadline. */
  targetDate: string | null
  entries: SavingsEntry[]
}

export type NewGoal = Pick<SavingsGoal, 'name' | 'target' | 'targetDate'>

export interface SavingsStore {
  list(): Promise<SavingsGoal[]>
  addGoal(goal: NewGoal): Promise<SavingsGoal>
  removeGoal(id: string): Promise<void>
  addEntry(goalId: string, amount: number, date: string): Promise<SavingsEntry>
  removeEntry(id: string): Promise<void>
}

export function savedAmount(goal: SavingsGoal): number {
  return goal.entries.reduce((sum, e) => sum + e.amount, 0)
}

function newestFirst(a: SavingsEntry, b: SavingsEntry) {
  return b.date.localeCompare(a.date)
}

const STORAGE_KEY = 'credit-spy.savings'

function readLocal(): SavingsGoal[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as SavingsGoal[]) : []
  } catch {
    return []
  }
}

function writeLocal(goals: SavingsGoal[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals))
  } catch {
    // Storage unavailable: changes last for this visit only.
  }
}

/** Fallback used until Supabase is configured. */
export const localSavingsStore: SavingsStore = {
  async list() {
    return readLocal()
  },
  async addGoal(goal) {
    const created: SavingsGoal = { ...goal, id: crypto.randomUUID(), entries: [] }
    writeLocal([...readLocal(), created])
    return created
  },
  async removeGoal(id) {
    writeLocal(readLocal().filter((g) => g.id !== id))
  },
  async addEntry(goalId, amount, date) {
    const entry: SavingsEntry = { id: crypto.randomUUID(), goalId, amount, date }
    writeLocal(readLocal().map((g) => (g.id === goalId ? { ...g, entries: [entry, ...g.entries].sort(newestFirst) } : g)))
    return entry
  },
  async removeEntry(id) {
    writeLocal(readLocal().map((g) => ({ ...g, entries: g.entries.filter((e) => e.id !== id) })))
  },
}

interface GoalRow {
  id: string
  name: string
  target: number | string
  target_date: string | null
}

interface EntryRow {
  id: string
  goal_id: string
  amount: number | string
  occurred_on: string
}

function fromEntry(row: EntryRow): SavingsEntry {
  return { id: row.id, goalId: row.goal_id, amount: Number(row.amount), date: row.occurred_on }
}

/** Goals and entries belong to a spy; row level security lets only its members in (supabase/savings.sql). */
export function supabaseSavingsStore(client: SupabaseClient, spyId: string): SavingsStore {
  return {
    async list() {
      const [goals, entries] = await Promise.all([
        client.from('savings_goals').select('id, name, target, target_date').eq('spy_id', spyId).order('created_at'),
        client
          .from('savings_entries')
          .select('id, goal_id, amount, occurred_on')
          .eq('spy_id', spyId)
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false }),
      ])
      if (goals.error) throw new Error(goals.error.message)
      if (entries.error) throw new Error(entries.error.message)
      const all = (entries.data as EntryRow[]).map(fromEntry)
      return (goals.data as GoalRow[]).map((g) => ({
        id: g.id,
        name: g.name,
        target: Number(g.target),
        targetDate: g.target_date,
        entries: all.filter((e) => e.goalId === g.id),
      }))
    },
    async addGoal(goal) {
      const { data, error } = await client
        .from('savings_goals')
        .insert({ spy_id: spyId, name: goal.name, target: goal.target, target_date: goal.targetDate })
        .select('id, name, target, target_date')
        .single()
      if (error) throw new Error(error.message)
      const row = data as GoalRow
      return { id: row.id, name: row.name, target: Number(row.target), targetDate: row.target_date, entries: [] }
    },
    async removeGoal(id) {
      const { error } = await client.from('savings_goals').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    async addEntry(goalId, amount, date) {
      const { data, error } = await client
        .from('savings_entries')
        .insert({ spy_id: spyId, goal_id: goalId, amount, occurred_on: date })
        .select('id, goal_id, amount, occurred_on')
        .single()
      if (error) throw new Error(error.message)
      return fromEntry(data as EntryRow)
    },
    async removeEntry(id) {
      const { error } = await client.from('savings_entries').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
  }
}
