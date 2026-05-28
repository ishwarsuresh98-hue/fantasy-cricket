import { createClient }    from '@/lib/supabase/server'
import { getClubBySlug }  from '@/lib/club'
import { notFound, redirect } from 'next/navigation'
import Link               from 'next/link'
import GameweekTeamBuilder from '@/components/contests/GameweekTeamBuilder'
import type { Player, ContestTeamRow } from '@/types'

export default async function PickTeamPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id: contestId } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Contest ────────────────────────────────────────────────────────────────
  const { data: contestRow } = await supabase
    .from('contests')
    .select('id, name, entry_fee, max_entries, max_teams, gameweek_id, match_id, status')
    .eq('id', contestId)
    .single()

  if (!contestRow) notFound()

  // Only gameweek contests use pick-team
  if (!contestRow.gameweek_id) redirect(`/clubs/${slug}/contests/${contestId}`)

  // ── Gameweek ───────────────────────────────────────────────────────────────
  const { data: gw } = await supabase
    .from('gameweeks')
    .select('id, number, name, match_date, match_id, season_id')
    .eq('id', contestRow.gameweek_id)
    .single()

  const seasonId = (gw?.season_id ?? '') as string
  const budget   = 100   // standard GW budget

  // ── Determine available players ────────────────────────────────────────────
  // Priority: match_playing_xi for the GW's match (confirmed squad)
  // Fallback: all active season players (squad not confirmed yet)
  const matchId = gw?.match_id as string | null | undefined

  let players: Player[] = []
  let playingXIConfirmed = false
  let matchInfo: { opponent: string; match_date: string } | null = null

  if (matchId) {
    const { data: xiRows } = await supabase
      .from('match_playing_xi')
      .select('player_id, players(id, name, role, price, is_active)')
      .eq('match_id', matchId)

    if (xiRows && xiRows.length > 0) {
      playingXIConfirmed = true
      players = xiRows
        .map(r => r.players as unknown as Player | null)
        .filter((p): p is Player => p !== null && p.is_active !== false)

      // Get match info for the caption
      const { data: m } = await supabase
        .from('matches')
        .select('opponent, match_date')
        .eq('id', matchId)
        .single()
      matchInfo = m
    }
  }

  // Fallback: all season players
  if (!playingXIConfirmed) {
    const { data: allPlayers } = await supabase
      .from('players')
      .select('id, name, role, price, is_active')
      .eq('season_id', seasonId)
      .eq('is_active', true)
      .order('price', { ascending: false })
    players = (allPlayers ?? []) as Player[]
  }

  // ── Recent form: avg points last 3 matches per player ─────────────────────
  const playerIds = players.map(p => p.id)
  const { data: recentPerfs } = playerIds.length > 0
    ? await supabase
        .from('match_performances')
        .select('player_id, base_points')
        .in('player_id', playerIds)
        .order('match_id', { ascending: false })
    : { data: [] }

  const formMap: Record<string, number[]> = {}
  for (const perf of recentPerfs ?? []) {
    const pid = perf.player_id as string
    if (!formMap[pid]) formMap[pid] = []
    if (formMap[pid].length < 3) formMap[pid].push(Number(perf.base_points))
  }

  // Attach form to players as extended Player objects
  const playersWithForm = players.map(p => ({
    ...p,
    avg_points:  formMap[p.id]?.length
      ? Math.round(formMap[p.id].reduce((a, b) => a + b, 0) / formMap[p.id].length * 10) / 10
      : 0,
    form: (() => {
      const f = formMap[p.id] ?? []
      if (f.length < 2) return 'neutral' as const
      return f[0] > f[1] ? 'up' as const : f[0] < f[1] ? 'down' as const : 'neutral' as const
    })(),
  }))

  // ── User's season team ─────────────────────────────────────────────────────
  const { data: myTeam } = await supabase
    .from('fantasy_teams')
    .select('id')
    .eq('season_id', seasonId)
    .eq('user_id', user.id)
    .maybeSingle()

  // ── Existing contest_team (editing) ───────────────────────────────────────
  const { data: existingContestTeam } = await supabase
    .from('contest_teams')
    .select('*')
    .eq('contest_id', contestId)
    .eq('user_id', user.id)
    .maybeSingle()

  // ── Wallet ─────────────────────────────────────────────────────────────────
  const { data: wallet } = await supabase
    .from('wallets').select('balance').eq('user_id', user.id).maybeSingle()

  const walletBalance = Number(wallet?.balance ?? 0)
  const entryFee      = Number(contestRow.entry_fee ?? 0)
  const base          = `/clubs/${slug}`
  const gwLabel       = gw
    ? `${gw.name} · ${new Date(gw.match_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`
    : 'Gameweek Contest'

  return (
    <div className="space-y-5 pb-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href={`${base}/contests`} className="hover:text-[#C9A84C] transition-colors">Contests</Link>
        <span>/</span>
        <Link href={`${base}/contests/${contestId}`} className="hover:text-[#C9A84C] transition-colors truncate max-w-[160px]">{contestRow.name}</Link>
        <span>/</span>
        <span className="text-gray-600 font-medium">Pick Team</span>
      </div>

      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-[#C9A84C] to-[#a8892e] px-5 py-4 text-black">
        <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-0.5">{gwLabel}</p>
        <h1 className="text-xl font-black leading-tight">{contestRow.name}</h1>
        <p className="text-sm opacity-80 mt-0.5">
          {entryFee === 0 ? 'Free entry' : `Entry fee: £${entryFee.toFixed(2)}`}
          {' · '}Budget: {budget}cr
        </p>
        {matchInfo && (
          <p className="text-xs opacity-60 mt-1">
            {playingXIConfirmed ? '✓ Team sheet confirmed' : '⏳ Team sheet pending'} · vs {matchInfo.opponent}
          </p>
        )}
      </div>

      {/* Playing XI not confirmed banner */}
      {!playingXIConfirmed && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-medium">
          <p className="font-black mb-0.5">⏳ Team sheets not yet confirmed</p>
          <p className="text-xs text-amber-700 font-normal">
            Showing all squad players. Check back closer to match day once the admin confirms the playing XI.
          </p>
        </div>
      )}

      {/* No season team warning */}
      {!myTeam && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-medium flex items-center justify-between gap-3">
          <span>You need a season team to enter contests.</span>
          <Link href={`${base}/team`} className="bg-[#C9A84C] text-black px-3 py-1.5 rounded-lg text-xs font-black hover:bg-[#a8892e] transition-colors flex-shrink-0">
            Create Team
          </Link>
        </div>
      )}

      {myTeam && (
        <GameweekTeamBuilder
          contestId={contestId}
          fantasyTeamId={myTeam.id}
          players={playersWithForm as unknown as Player[]}
          budget={budget}
          entryFee={entryFee}
          walletBalance={walletBalance}
          clubSlug={slug}
          existingTeam={existingContestTeam as ContestTeamRow | null}
        />
      )}
    </div>
  )
}
