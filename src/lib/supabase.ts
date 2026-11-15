import { createClient } from '@supabase/supabase-js'

const url: string | undefined = import.meta.env.VITE_SUPABASE_URL
const anonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY

/** null until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.local */
export const supabase = url && anonKey ? createClient(url, anonKey) : null
