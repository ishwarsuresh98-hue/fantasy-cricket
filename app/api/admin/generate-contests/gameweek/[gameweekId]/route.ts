import { NextResponse }    from 'next/server'
import { createClient }    from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── POST /api/admin/generate-contests/gameweek/[gameweekId] ──────────────────
//
// Generates one contest per active contest_template for this club,
// all linked to the given gameweek via gameweek_id.
//
// Requires admin role.
// Skips templates that already have a contest for this gameweek.

const DEFAULT_TEMPLATES = [
  { name: 'Practice',          type: 'practice',         entry_fee: 0,    max_entries: 50,  platform_fee_pct: 0,  prize_structure: [] },
  { name: 'Head to Head',      type: 'head_to_head',     entry_fee: 1,    max_entries: 2,   platform_fee_pct: 15, prize_structure: [{ rank_from: 1, rank_to: 1, prize_pct: 85 }] },
  { name: 'Trio',              type: 'small_league',     entry_fee: 1.5,  max_entries: 3,   platform_fee_pct: 15, prize_structure: [{ rank_from: 1, rank_to: 1, prize_pct: 75 }] },
  { name: 'Four Way',          type: 'small_league',     entry_fee: 2,    max_entries: 4,   platform_fee_pct: 15, prize_structure: [{ rank_from: 1, rank_to: 1, prize_pct: 65 }, { rank_from: 2, rank_to: 2, prize_pct: 20 }] },
  { name: 'Small League',      type: 'small_league',     entry_fee: 2,    max_entries: 8,   platform_fee_pct: 15, prize_structure: [{ rank_from: 1, rank_to: 1, prize_pct: 50 }, { rank_from: 2, rank_to: 2, prize_pct: 30 }, { rank_from: 3, rank_to: 3, prize_pct: 20 }] },
  { name: 'Mega League',       type: 'mega',             entry_fee: 5,    max_entries: 100, platform_fee_pct: 15, prize_structure: [{ rank_from: 1, rank_to: 1, prize_pct: 40 }, { rank_from: 2, rank_to: 2, prize_pct: 25 }, { rank_from: 3, rank_to: 3, prize_pct: 15 }, { rank_from: 4, rank_to: 30, prize_pct: 20 }] },
  { name: 'Winner Takes All',  type: 'winner_takes_all', entry_fee: 5,    max_entries: 10,  platform_fee_pct: 15, prize_structure: [{ rank_from: 1, rank_to: 1, prize_pct: 85 }] },
]

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ gameweekId: string }> },
) {
  const { gameweekId } = await params
  const supabase = await createClient()

  // ── Auth + admin check ────────────────────────────────────────────────────
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Load gameweek ─────────────────────────────────────────────────────────
  const { data: gw } = await supabase
    .from('gameweeks')
    .select('id, season_id, match_id, number, name, match_date')
    .eq('id', gameweekId)
    .single()

  if (!gw) return NextResponse.json({ error: 'Gameweek not found' }, { status: 404 })

  // ── Load season to get club_id ────────────────────────────────────────────
  const { data: season } = await supabase
    .from('seasons').select('id, club_id').eq('id', gw.season_id).single()

  if (!season) return NextResponse.json({ error: 'Season not found' }, { status: 404 })

  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 })
  }

  // ── Check existing contests for this gameweek ─────────────────────────────
  const { data: existing } = await admin
    .from('contests')
    .select('name')
    .eq('gameweek_id', gameweekId)

  const existingNames = new Set((existing ?? []).map((c: { name: string }) => c.name))

  // ── Try to use contest_templates; fall back to DEFAULT_TEMPLATES ──────────
  const { data: templates } = await admin
    .from('contest_templates')
    .select('*')
    .eq('club_id', season.club_id)
    .eq('is_active', true)
    .order('entry_fee', { ascending: true })

  const contestDefs = (templates && templates.length > 0)
    ? (templates as typeof DEFAULT_TEMPLATES)
    : DEFAULT_TEMPLATES

  // ── Insert contests ───────────────────────────────────────────────────────
  const toInsert = contestDefs
    .filter((t) => !existingNames.has(t.name))
    .map((t) => ({
      season_id:        gw.season_id,
      match_id:         gw.match_id ?? null,
      gameweek_id:      gameweekId,
      name:             t.name,
      type:             t.type,
      entry_fee:        t.entry_fee,
      max_entries:      t.max_entries,
      max_teams:        t.max_entries,
      platform_fee_pct: t.platform_fee_pct,
      prize_structure:  t.prize_structure,
      is_guaranteed:    false,
      status:           'open',
      created_by:       user.id,
    }))

  if (toInsert.length === 0) {
    return NextResponse.json({ ok: true, created: 0, message: 'All contests already exist for this gameweek' })
  }

  const { data: inserted, error: insertErr } = await admin
    .from('contests')
    .insert(toInsert)
    .select('id')

  if (insertErr) {
    console.error('[generate-gw-contests] insert error:', insertErr)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok:      true,
    created: inserted?.length ?? 0,
    gameweek: gw.name,
  })
}
