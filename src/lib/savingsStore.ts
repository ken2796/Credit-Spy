import type { SupabaseClient } from '@supabase/supabase-js'

export type EntryKind = 'deposit' | 'withdraw' | 'borrow' | 'repay'

export interface SavingsEntry {
  id: string
  goalId: string
  kind: EntryKind
  /** Positive for money put in (deposit, repay), negative for money taken out (withdraw, borrow). */
  amount: number
  /** YYYY-MM-DD */
  date: string
  /** What a borrow was for. */
  note: string | null
  /** When a borrow should be paid back, YYYY-MM-DD. */
  dueDate: string | null
  /** For a repay: the borrow it pays back. */
  loanId: string | null
}

export interface NewEntry {
  kind: EntryKind
  /** Always positive; the sign comes from the kind. */
  amount: number
  date: string
  note?: string | null
  dueDate?: string | null
  loanId?: string | null
}

/** A borrow from savings, with what has been paid back so far. */
export interface Loan {
  entry: SavingsEntry
  borrowed: number
  repaid: number
  owed: number
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
  addEntry(goalId: string, entry: NewEntry): Promise<SavingsEntry>
  removeEntry(id: string): Promise<void>
}

export function savedAmount(goal: SavingsGoal): number {
  return goal.entries.reduce((sum, e) => sum + e.amount, 0)
}

export function loansOf(goal: SavingsGoal): Loan[] {
  return goal.entries
    .filter((e) => e.kind === 'borrow')
    .map((entry) => {
      const borrowed = -entry.amount
      const repaid = goal.entries.filter((e) => e.kind === 'repay' && e.loanId === entry.id).reduce((sum, e) => sum + e.amount, 0)
      return { entry, borrowed, repaid, owed: Math.max(0, Math.round((borrowed - repaid) * 100) / 100) }
    })
}

/** Total still owed back to a goal. */
export function owedTo(goal: SavingsGoal): number {
  return loansOf(goal).reduce((sum, l) => sum + l.owed, 0)
}

function signed(entry: NewEntry): number {
  return entry.kind === 'withdraw' || entry.kind === 'borrow' ? -Math.abs(entry.amount) : Math.abs(entry.amount)
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
  async addEntry(goalId, input) {
    const entry: SavingsEntry = {
      id: crypto.randomUUID(),
      goalId,
      kind: input.kind,
      amount: signed(input),
      date: input.date,
      note: input.note ?? null,
      dueDate: input.dueDate ?? null,
      loanId: input.loanId ?? null,
    }
    writeLocal(readLocal().map((g) => (g.id === goalId ? { ...g, entries: [entry, ...g.entries].sort(newestFirst) } : g)))
    return entry
  },
  async removeEntry(id) {
    writeLocal(readLocal().map((g) => ({ ...g, entries: g.entries.filter((e) => e.id !== id && e.loanId !== id) })))
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
  kind: EntryKind
  amount: number | string
  occurred_on: string
  note: string | null
  due_on: string | null
  loan_id: string | null
}

const ENTRY_COLUMNS = 'id, goal_id, kind, amount, occurred_on, note, due_on, loan_id'

function fromEntry(row: EntryRow): SavingsEntry {
  return {
    id: row.id,
    goalId: row.goal_id,
    kind: row.kind,
    amount: Number(row.amount),
    date: row.occurred_on,
    note: row.note,
    dueDate: row.due_on,
    loanId: row.loan_id,
  }
}

/** Goals and entries belong to a spy; row level security lets only its members in (supabase/savings.sql). */
export function supabaseSavingsStore(client: SupabaseClient, spyId: string): SavingsStore {
  return {
    async list() {
      const [goals, entries] = await Promise.all([
        client.from('savings_goals').select('id, name, target, target_date').eq('spy_id', spyId).order('created_at'),
        client
          .from('savings_entries')
          .select(ENTRY_COLUMNS)
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
    async addEntry(goalId, input) {
      const { data, error } = await client
        .from('savings_entries')
        .insert({
          spy_id: spyId,
          goal_id: goalId,
          kind: input.kind,
          amount: signed(input),
          occurred_on: input.date,
          note: input.note || null,
          due_on: input.dueDate || null,
          loan_id: input.loanId ?? null,
        })
        .select(ENTRY_COLUMNS)
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
