import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client for legacy shared attendance and staging Auth.
 *
 * Vite inlines `VITE_*` variables at build time, so both values must be
 * present when the matching build runs. The anon key is public; database
 * access must still be constrained by the deployed RLS policies and RPCs.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

const hasPlaceholderConfig =
  url.includes('YOUR-STAGING-PROJECT') ||
  anonKey.includes('YOUR-STAGING-ANON-PUBLIC-KEY')
const hasSupabaseConfig = Boolean(url && anonKey && !hasPlaceholderConfig)

export const isAttendanceSyncConfigured = hasSupabaseConfig
export const isSupabaseAuthEnabled =
  import.meta.env.MODE === 'staging' &&
  import.meta.env.VITE_SUPABASE_AUTH_ENABLED === 'true' &&
  hasSupabaseConfig

export const SUPABASE_SETUP_MESSAGE =
  'Supabase is not configured for this environment. Add the correct project URL and anon public key.'
export const ATTENDANCE_SETUP_MESSAGE =
  'Shared live attendance is not configured. Add the correct VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then apply the required schema and migrations.'

export const supabase: SupabaseClient | null = hasSupabaseConfig
  ? createClient(url, anonKey)
  : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error(SUPABASE_SETUP_MESSAGE)
  return supabase
}
