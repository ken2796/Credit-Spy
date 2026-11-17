export type Tab = 'home' | 'setup' | 'profile'

export const TABS: Tab[] = ['home', 'setup', 'profile']

/** The tab named in the URL hash (#home, #setup, #profile), defaulting to home. */
export function tabFromHash(hash: string): Tab {
  const name = hash.replace(/^#/, '')
  return (TABS as string[]).includes(name) ? (name as Tab) : 'home'
}
