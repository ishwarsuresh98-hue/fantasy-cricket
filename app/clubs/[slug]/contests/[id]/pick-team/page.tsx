import { createClient }   from '@/lib/supabase/server'
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
    .select('id, name, entry_fee, max_entries, max_teams, gameweek_id, season_id, status')
    .eq('id', contestId)
    .single()

  if (!contestRow) notFound()

  // Only gameweek contests use pick-team
  if (!contestRow.gameweek_id) {
    redirect(`/clubs/${slug}/contests/${contestId}`)
  }

  // ── Gameweek ───────────────────────────────────────────────────────────────
  const { data: gw } = await supabase
    .from('gameweeks')
    .select('id, number, name, match_date, match_id')
    .eq('id', contestRow.gameweek_id)
    .single()

  // ── Active season ──────────────────────────────────────────────────────────
  const seasonId = contestRow.season_id as string
  const { data: season } = await supabase
    .from('seasons')
    .select('id, team_budget')
    .eq('id', seasonId)
    .single()

  const budget = Number(season?.team_budget ?? 100)

  // ── Players for this season ────────────────────────────────────────────────
  const { data: players } = await supabase
    .from('players')
    .select('id, name, role, price, is_active')
    .eq('season_id', seasonId)
    .eq('is_active', true)
    .order('price', { ascending: false })

  // ── User's season team (for fantasy_team_id used in contest_entry) ────────
  const { data: myTeam } = await supabase
    .from('fantasy_teams')
    .select('id')
    .eq('season_id', seasonId)
    .eq('user_id', user.id)
    .maybeSingle()

  // ── Existing contest_team (editing case) ──────────────────────────────────
  const { data: existingContestTeam } = await supabase
    .from('contest_teams')
    .select('*')
    .eq('contest_id', contestId)
    .eq('user_id', user.id)
    .maybeSingle()

  // ── Wallet balance ─────────────────────────────────────────────────────────
  const { data: wallet } = await supabase
    .from('wallets')
    .select('balance')
    .eq('user_id', user.id)
    .maybeSingle()

  const walletBalance = Number(wallet?.balance ?? 0)
  const entryFee      = Number(contestRow.entry_fee ?? 0)
  const base          = `/clubs/${slug}`

  const gwLabel = gw ? `${gw.name} · ${new Date(gw.match_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : 'Gameweek Contest'

  return (
    <div className="space-y-5 pb-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href={`${base}/contests`} className="hover:text-[#C9A84C] transition-colors">Contests</Link>
        <span>/</span>
        <Link href={`${base}/contests/${contestId}`} className="hover:text-[#C9A84C] transition-colors truncate">{contestRow.name}</Link>
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
      </div>

      {/* No team warning */}
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
          players={(players ?? []) as Player[]}
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
