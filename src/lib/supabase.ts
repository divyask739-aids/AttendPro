import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Shared attendance backend.
 *
 * Vite inlines `VITE_*` variables at build time, so both values must be
 * present when `npm run build` runs. The anon key is designed to be public;
 * it only grants access to the security-definer functions in
 * `supabase/schema.sql`, never to the tables directly.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export const isAttendanceSyncConfigured = Boolean(url && anonKey)

export const ATTENDANCE_SETUP_MESSAGE =
  'Live attendance is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then apply supabase/schema.sql.'

export const supabase: SupabaseClient | null = isAttendanceSyncConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error(ATTENDANCE_SETUP_MESSAGE)
  return supabase
}
