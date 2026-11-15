// Sample data only. Replace with a real credit bureau / aggregator API.

export const SCORE_MIN = 300
export const SCORE_MAX = 850

export type Tone = 'good' | 'watch'

export interface ScorePoint {
  month: string
  score: number
}

export interface Factor {
  label: string
  detail: string
  /** 0–100: how healthy this factor is */
  health: number
  tone: Tone
}

export interface Account {
  name: string
  kind: 'Credit card' | 'Installment'
  note: string
  balance: number
  /** Credit limit for cards, original amount for loans */
  limit: number
}

export interface Alert {
  level: 'WATCH' | 'INFO'
  title: string
  detail: string
}

export const history: ScorePoint[] = [
  { month: 'Dec 2025', score: 698 },
  { month: 'Jan 2026', score: 702 },
  { month: 'Feb 2026', score: 699 },
  { month: 'Mar 2026', score: 708 },
  { month: 'Apr 2026', score: 715 },
  { month: 'May 2026', score: 712 },
  { month: 'Jun 2026', score: 721 },
  { month: 'Jul 2026', score: 726 },
  { month: 'Aug 2026', score: 731 },
  { month: 'Sep 2026', score: 729 },
  { month: 'Oct 2026', score: 738 },
  { month: 'Nov 2026', score: 742 },
]

export const accounts: Account[] = [
  { name: 'Cashback Visa', kind: 'Credit card', note: 'opened 2020', balance: 1860, limit: 6000 },
  { name: 'Travel Mastercard', kind: 'Credit card', note: 'opened 2022', balance: 440, limit: 4000 },
  { name: 'Auto loan', kind: 'Installment', note: '29 payments left', balance: 8640, limit: 18000 },
]

export const alerts: Alert[] = [
  { level: 'WATCH', title: 'New hard inquiry spotted', detail: 'Auto lender check · Nov 12' },
  { level: 'INFO', title: 'Card balance dropped 18%', detail: 'Cashback Visa · Nov 8' },
  { level: 'INFO', title: 'Score moved up 4 points', detail: 'Monthly refresh · Nov 1' },
]

/** Share of total card limits currently in use, 0–100. */
export function cardUtilization(list: Account[]): number {
  const cards = list.filter((a) => a.kind === 'Credit card')
  const limit = cards.reduce((sum, a) => sum + a.limit, 0)
  if (limit === 0) return 0
  return Math.round((cards.reduce((sum, a) => sum + a.balance, 0) / limit) * 100)
}

const utilization = cardUtilization(accounts)

export const factors: Factor[] = [
  { label: 'Payment history', detail: '100% on time', health: 100, tone: 'good' },
  { label: 'Credit utilization', detail: `${utilization}% used`, health: 100 - utilization, tone: utilization > 30 ? 'watch' : 'good' },
  { label: 'Age of credit', detail: '6 yrs 2 mos', health: 62, tone: 'good' },
  { label: 'Hard inquiries', detail: '2 in 12 mos', health: 55, tone: 'watch' },
  { label: 'Credit mix', detail: '4 account types', health: 80, tone: 'good' },
]

export function scoreRating(score: number): string {
  if (score >= 800) return 'Exceptional'
  if (score >= 740) return 'Very good'
  if (score >= 670) return 'Good'
  if (score >= 580) return 'Fair'
  return 'Poor'
}

export const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})
