import { useState } from 'react'
import type { FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type Mode = 'sign-in' | 'sign-up'

export function AuthForm({ client }: { client: SupabaseClient }) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    const credentials = { email: email.trim(), password }
    const { data, error } =
      mode === 'sign-in' ? await client.auth.signInWithPassword(credentials) : await client.auth.signUp(credentials)
    setBusy(false)
    if (error) setMessage(error.message)
    else if (!data.session) setMessage('Account created. Check your email to confirm it, then sign in.')
  }

  async function signInWithGoogle() {
    setBusy(true)
    setMessage(null)
    // Sends the browser to Google, then back to this page signed in.
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setBusy(false)
      setMessage(error.message)
    }
  }

  return (
    <form className="item-form auth-form" onSubmit={submit}>
      <p className="muted auth-intro">Sign in to see and save your income, credit items, and money in &amp; out.</p>
      <button type="button" className="primary google-button" onClick={() => void signInWithGoogle()} disabled={busy}>
        Continue with Google
      </button>
      <p className="muted small auth-intro">
        {mode === 'sign-in' ? 'Or sign in with email:' : 'Or create an account with email:'}
      </p>
      <label className="field field-wide">
        <span>Email</span>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field field-wide">
        <span>Password</span>
        <input
          type="password"
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <button type="submit" className="ghost" disabled={busy}>
        {mode === 'sign-in' ? 'Sign in' : 'Create account'}
      </button>
      <button type="button" className="ghost" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
        {mode === 'sign-in' ? 'New here? Create account' : 'Have an account? Sign in'}
      </button>
      {message && (
        <div className="item-preview small auth-message" role="status">
          {message}
        </div>
      )}
    </form>
  )
}
