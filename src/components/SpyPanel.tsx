import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createInvite, inviteLink, listMembers, listOpenInvites, removeMember, revokeInvite } from '../lib/spy'
import type { Spy, SpyInvite, SpyMember } from '../lib/spy'

interface Props {
  client: SupabaseClient
  spy: Spy
  spies: Spy[]
  userId: string
  onSwitch: (spyId: string) => void
  /** Called after leaving a spy so the list can be reloaded. */
  onLeft: () => void
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

function daysLeft(iso: string): string {
  const days = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
  return days === 1 ? '1 day left' : `${days} days left`
}

export function SpyPanel({ client, spy, spies, userId, onSwitch, onLeft }: Props) {
  const isOwner = spy.role === 'owner'
  const [members, setMembers] = useState<SpyMember[]>([])
  const [invites, setInvites] = useState<SpyInvite[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setMembers(await listMembers(client, spy.id))
      setInvites(isOwner ? await listOpenInvites(client, spy.id) : [])
    } catch (e) {
      setError(errorText(e))
    }
  }, [client, spy.id, isOwner])

  useEffect(() => {
    void reload()
  }, [reload])

  async function invite() {
    setBusy(true)
    setError(null)
    try {
      const code = await createInvite(client, spy.id)
      await reload()
      await shareLink(code)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function shareLink(code: string) {
    const link = inviteLink(code)
    try {
      await navigator.clipboard.writeText(link)
      setCopied(code)
    } catch {
      // Clipboard blocked: the link stays visible to copy by hand.
      setCopied(null)
    }
  }

  async function nativeShare(code: string) {
    try {
      await navigator.share({ title: 'Join my Credit Spy', text: `Join ${spy.name} on Credit Spy`, url: inviteLink(code) })
    } catch {
      // Share sheet closed.
    }
  }

  async function revoke(id: string) {
    setError(null)
    try {
      await revokeInvite(client, id)
      setInvites((list) => list.filter((i) => i.id !== id))
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function remove(member: SpyMember) {
    const leaving = member.userId === userId
    const question = leaving
      ? `Leave ${spy.name}? You will no longer see or edit its money data.`
      : `Remove ${member.name} from ${spy.name}? They will no longer see or edit its money data.`
    if (!window.confirm(question)) return
    setError(null)
    try {
      await removeMember(client, spy.id, member.userId)
      if (leaving) onLeft()
      else setMembers((list) => list.filter((m) => m.userId !== member.userId))
    } catch (e) {
      setError(errorText(e))
    }
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <section id="spy" className="card">
      <div className="card-head">
        <h2>{spy.name}</h2>
        <span className="mono muted small">
          {members.length || spy.memberCount} {(members.length || spy.memberCount) === 1 ? 'person' : 'people'} · you are the {spy.role}
        </span>
      </div>

      {spies.length > 1 && (
        <label className="field field-wide">
          <span>Viewing</span>
          <select value={spy.id} onChange={(e) => onSwitch(e.target.value)}>
            {spies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.role === 'owner' ? ' (yours)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="muted small spy-intro">
        Everyone in this spy can add and edit its income, credit items, and money in &amp; out.
      </p>

      {members.map((m) => (
        <div key={m.userId} className="item-row">
          <div className="item-main">
            <div className="strong">
              {m.name} {m.userId === userId && <span className="muted">(you)</span>}
            </div>
            <div className="muted small">{m.email}</div>
          </div>
          <span className={`tag mono ${m.role === 'owner' ? 'tag-owner' : 'tag-info'}`}>{m.role.toUpperCase()}</span>
          {m.role !== 'owner' && (isOwner || m.userId === userId) && (
            <button type="button" className="ghost" onClick={() => void remove(m)}>
              {m.userId === userId ? 'Leave' : 'Remove'}
            </button>
          )}
        </div>
      ))}

      {isOwner && (
        <>
          <button type="button" className="primary invite-button" onClick={() => void invite()} disabled={busy}>
            Invite someone to join
          </button>
          <p className="muted small spy-intro">
            Each invite link works for one person and expires in 7 days. Send it by text, Messenger or email.
          </p>
          {invites.map((i) => (
            <div key={i.id} className="invite-row">
              <input className="invite-link mono small" readOnly value={inviteLink(i.code)} aria-label="Invite link" onFocus={(e) => e.target.select()} />
              <div className="item-actions">
                <button type="button" className="ghost" onClick={() => void shareLink(i.code)}>
                  {copied === i.code ? 'Copied' : 'Copy link'}
                </button>
                {canShare && (
                  <button type="button" className="ghost" onClick={() => void nativeShare(i.code)}>
                    Share
                  </button>
                )}
                <button type="button" className="ghost" onClick={() => void revoke(i.id)} aria-label="Cancel this invite">
                  Cancel
                </button>
              </div>
              <span className="muted small">{daysLeft(i.expiresAt)}</span>
            </div>
          ))}
        </>
      )}

      {error && (
        <div className="error small" role="alert">
          {error}
        </div>
      )}
    </section>
  )
}
