import type { Transaction } from './transactionStore'

/** Someone whose money is tracked: a spy member, or just "You" when data stays in this browser. */
export interface Person {
  /** User id, or null for the single person in browser-only mode. */
  id: string | null
  name: string
}

export interface MemberMoney {
  key: string
  name: string
  moneyIn: number
  moneyOut: number
  entries: Transaction[]
}

/**
 * Splits entries by member, one group per person in order (even with nothing recorded).
 * Entries for someone no longer in the spy are grouped under "Former member".
 */
export function groupByMember(entries: Transaction[], people: Person[]): MemberMoney[] {
  const groups = new Map<string, MemberMoney>()
  for (const p of people) {
    const key = p.id ?? ''
    groups.set(key, { key, name: p.name, moneyIn: 0, moneyOut: 0, entries: [] })
  }
  for (const t of entries) {
    const key = t.memberId ?? ''
    let group = groups.get(key)
    if (!group) {
      group = { key, name: key ? 'Former member' : 'Not assigned', moneyIn: 0, moneyOut: 0, entries: [] }
      groups.set(key, group)
    }
    group.entries.push(t)
    if (t.kind === 'in') group.moneyIn += t.amount
    else group.moneyOut += t.amount
  }
  return [...groups.values()]
}
