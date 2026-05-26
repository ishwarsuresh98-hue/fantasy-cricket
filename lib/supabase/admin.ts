import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side admin client that uses the service-role key.
 * Bypasses RLS — only call from trusted API routes after verifying the
 * caller is an authenticated admin.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (never expose to client).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
      'Add SUPABASE_SERVICE_ROLE_KEY to .env.local (Supabase dashboard → Settings → API → service_role key).',
    )
  }

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  })
}
