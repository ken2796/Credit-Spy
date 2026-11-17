import type { SupabaseClient } from '@supabase/supabase-js'

/** A shared money space. Everyone in it can add and edit its money data. */
export interface Spy {
  id: string
  name: string
  role: 'owner' | 'member'
  memberCount: number
}

export interface SpyMember {
  userId: string
  name: string
  email: string
  role: 'owner' | 'member'
}

export interface SpyInvite {
  id: string
  code: string
  expiresAt: string
}

export interface InviteInfo {
  spyName: string
  invitedBy: string
  status: 'open' | 'used' | 'expired' | 'member'
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/** Makes the person's own spy the first time; returns every spy they are in. */
export async function loadMySpies(client: SupabaseClient): Promise<Spy[]> {
  fail((await client.rpc('ensure_my_spy')).error)
  const { data, error } = await client.rpc('my_spies')
  fail(error)
  return (data as { id: string; name: string; role: Spy['role']; member_count: number }[]).map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    memberCount: s.member_count,
  }))
}

export async function listMembers(client: SupabaseClient, spyId: string): Promise<SpyMember[]> {
  const { data, error } = await client.rpc('list_spy_members', { p_spy: spyId })
  fail(error)
  return (data as { user_id: string; name: string; email: string; role: SpyMember['role'] }[]).map((m) => ({
    userId: m.user_id,
    name: m.name,
    email: m.email,
    role: m.role,
  }))
}

/** Invites that have not been used yet, newest first (owner only). */
export async function listOpenInvites(client: SupabaseClient, spyId: string): Promise<SpyInvite[]> {
  const { data, error } = await client
    .from('spy_invites')
    .select('id, code, expires_at')
    .eq('spy_id', spyId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  fail(error)
  return (data as { id: string; code: string; expires_at: string }[]).map((i) => ({
    id: i.id,
    code: i.code,
    expiresAt: i.expires_at,
  }))
}

export async function createInvite(client: SupabaseClient, spyId: string): Promise<string> {
  const { data, error } = await client.rpc('create_spy_invite', { p_spy: spyId })
  fail(error)
  return data as string
}

export async function revokeInvite(client: SupabaseClient, inviteId: string): Promise<void> {
  fail((await client.from('spy_invites').delete().eq('id', inviteId)).error)
}

export async function getInvite(client: SupabaseClient, code: string): Promise<InviteInfo | null> {
  const { data, error } = await client.rpc('get_spy_invite', { p_code: code })
  fail(error)
  const row = (data as { spy_name: string; invited_by: string; status: InviteInfo['status'] }[])[0]
  return row ? { spyName: row.spy_name, invitedBy: row.invited_by, status: row.status } : null
}

export async function acceptInvite(client: SupabaseClient, code: string): Promise<string> {
  const { data, error } = await client.rpc('accept_spy_invite', { p_code: code })
  fail(error)
  return data as string
}

export async function removeMember(client: SupabaseClient, spyId: string, userId: string): Promise<void> {
  fail((await client.rpc('remove_spy_member', { p_spy: spyId, p_user: userId })).error)
}

export function inviteLink(code: string): string {
  return `${window.location.origin}/?join=${code}`
}

// A join link opened before signing in is remembered through the Google
// sign-in round trip, then offered once the person is signed in.

const JOIN_KEY = 'credit-spy.join'
const CURRENT_KEY = 'credit-spy.spy'

/** Moves a ?join= code from the address bar into storage. */
export function captureJoinCode(): void {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('join')
  if (!code) return
  try {
    localStorage.setItem(JOIN_KEY, code)
  } catch {
    // Without storage the code is only kept for this page load.
    pendingCode = code
  }
  url.searchParams.delete('join')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
}

let pendingCode: string | null = null

export function readJoinCode(): string | null {
  try {
    return localStorage.getItem(JOIN_KEY) ?? pendingCode
  } catch {
    return pendingCode
  }
}

export function clearJoinCode(): void {
  pendingCode = null
  try {
    localStorage.removeItem(JOIN_KEY)
  } catch {
    // Nothing stored.
  }
}

export function rememberCurrentSpy(spyId: string): void {
  try {
    localStorage.setItem(CURRENT_KEY, spyId)
  } catch {
    // The first spy is used next time instead.
  }
}

export function readCurrentSpy(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}
