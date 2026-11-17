import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { acceptInvite, getInvite } from '../lib/spy'
import type { InviteInfo } from '../lib/spy'

interface Props {
  client: SupabaseClient
  code: string
  onJoined: (spyId: string) => void
  onDismiss: () => void
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}

/** Shown after opening an invite link: lets the person accept or decline. */
export function JoinPrompt({ client, code, onJoined, onDismiss }: Props) {
  const [info, setInfo] = useState<InviteInfo | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    getInvite(client, code)
      .then((result) => !cancelled && setInfo(result))
      .catch((e: unknown) => !cancelled && setError(errorText(e)))
    return () => {
      cancelled = true
    }
  }, [client, code])

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      onJoined(await acceptInvite(client, code))
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  let body: React.ReactNode
  if (info === undefined && !error) {
    body = <p className="muted">Checking your invite…</p>
  } else if (info === null) {
    body = <p>This invite link is not valid. Ask the person who sent it for a new one.</p>
  } else if (info?.status === 'used') {
    body = <p>This invite link was already used. Ask {info.invitedBy} for a new one.</p>
  } else if (info?.status === 'expired') {
    body = <p>This invite link has expired. Ask {info.invitedBy} for a new one.</p>
  } else if (info?.status === 'member') {
    body = <p>You are already in {info.spyName}.</p>
  } else if (info) {
    body = (
      <>
        <p>
          <strong>{info.invitedBy}</strong> invited you to join <strong>{info.spyName}</strong>. If you accept, you can see,
          add and edit its income, credit items, and money in &amp; out.
        </p>
        <div className="item-actions">
          <button type="button" className="primary" onClick={() => void accept()} disabled={busy}>
            Accept and join
          </button>
          <button type="button" className="ghost" onClick={onDismiss} disabled={busy}>
            Decline
          </button>
        </div>
      </>
    )
  }

  const finished = info === null || info?.status === 'used' || info?.status === 'expired' || info?.status === 'member'

  return (
    <section className="card join-card" aria-live="polite">
      <h2>Spy invite</h2>
      {body}
      {error && (
        <div className="error small" role="alert">
          {error}
        </div>
      )}
      {(finished || (error && !info)) && (
        <div className="item-actions">
          <button type="button" className="ghost" onClick={onDismiss}>
            Close
          </button>
        </div>
      )}
    </section>
  )
}
