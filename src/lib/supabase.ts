import { createClient } from '@supabase/supabase-js'

const env = import.meta.env

// VITE_ names are for local .env.local; NEXT_PUBLIC_ names are what Vercel's
// Supabase integration sets on the deployed project. All of these are public.
const url: string | undefined = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const anonKey: string | undefined =
  env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** null until a Supabase URL and public key are available (see .env.example) */
export const supabase = url && anonKey ? createClient(url, anonKey) : null
