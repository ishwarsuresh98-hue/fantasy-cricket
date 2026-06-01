import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BASE    = 'https://play-cricket.com/api/v2'
const API_KEY = process.env.PLAY_CRICKET_API_KEY ?? ''

// GET /api/admin/debug-pc?pc_id=7276987
// Returns the raw match_details[0] object so we can see every field name
// from the Play Cricket API without any TypeScript type filtering.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pc_id = new URL(req.url).searchParams.get('pc_id') ?? '7276987'

  if (!API_KEY) return NextResponse.json({ error: 'PLAY_CRICKET_API_KEY not set' }, { status: 500 })

  const url = `${BASE}/match_detail.json?match_id=${pc_id}&api_token=${API_KEY}`
  const res  = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'fantasy-cricket-app/1.0' },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return NextResponse.json({ error: `PC API ${res.status}: ${body.slice(0, 300)}` }, { status: 502 })
  }

  const raw = await res.json() as { match_details?: unknown[] }

  // Return the raw first match object so every field is visible
  const detail = raw.match_details?.[0] as Record<string, unknown> | null ?? null
  return NextResponse.json({
    // Top-level keys — scan these for the result field name
    raw_keys:          detail ? Object.keys(detail) : [],
    // The two most likely result fields highlighted for easy inspection
    result_description: detail?.result_description,
    match_result:       detail?.match_result,
    // Full raw object
    raw_detail:        detail,
  })
}
