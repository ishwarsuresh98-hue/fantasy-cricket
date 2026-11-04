/**
 * Server-side API key authentication for ClubPulse → The XI integration.
 *
 * These endpoints are called server-to-server from ClubPulse, not from a
 * browser session.  They authenticate via a shared secret in the
 * Authorization header:  Authorization: Bearer <XI_API_KEY>
 *
 * Never import this in client components — the key must stay server-side.
 */

import { NextRequest, NextResponse } from 'next/server'

export function verifyXiApiKey(req: NextRequest): NextResponse | null {
  const apiKey = process.env.XI_API_KEY
  if (!apiKey) {
    console.error('[xi/auth] XI_API_KEY env var is not set')
    return NextResponse.json({ error: 'Service misconfigured' }, { status: 500 })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!token || token !== apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // null means "auth passed"
  return null
}
