/**
 * POST /api/xi/users/create
 *
 * Called by ClubPulse when a player signs up to provision their XI account.
 * Authentication: Bearer token (XI_API_KEY) — server-to-server only.
 *
 * Request body:
 *   { clubpulse_user_id: string, name: string, email: string }
 *
 * Response:
 *   201  { xi_user_id: string }
 *   409  { error: "User already exists", xi_user_id: string }
 *   400  { error: string }
 *   401  { error: "Unauthorized" }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'
import { verifyXiApiKey }            from '@/lib/xi/auth'

interface CreateUserBody {
  clubpulse_user_id: string
  name: string
  email: string
}

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const authError = verifyXiApiKey(req)
  if (authError) return authError

  // ── Parse body ───────────────────────────────────────────────────────────
  let body: CreateUserBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { clubpulse_user_id, name, email } = body

  if (!clubpulse_user_id || !name || !email) {
    return NextResponse.json(
      { error: 'Missing required fields: clubpulse_user_id, name, email' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  // ── Idempotency check — return existing user rather than duplicating ──────
  const { data: existing } = await admin
    .from('xi_users')
    .select('id')
    .eq('clubpulse_user_id', clubpulse_user_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'User already exists', xi_user_id: existing.id },
      { status: 409 },
    )
  }

  // ── Create XI user row ────────────────────────────────────────────────────
  const { data: newUser, error } = await admin
    .from('xi_users')
    .insert({
      clubpulse_user_id,
      display_name: name,
      email,
      wallet_balance: 0,
      tier: 'bronze',
      lifetime_earned: 0,
    })
    .select('id')
    .single()

  if (error || !newUser) {
    console.error('[xi/users/create] insert error:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 },
    )
  }

  return NextResponse.json({ xi_user_id: newUser.id }, { status: 201 })
}
