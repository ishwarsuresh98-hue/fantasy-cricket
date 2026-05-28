import { createClient }   from '@/lib/supabase/server'
import { getClubBySlug }  from '@/lib/club'
import { notFound }       from 'next/navigation'
import Link               from 'next/link'
import { cn }             from '@/lib/utils'
import { netPrizePool, type PrizeSlot } from '@/lib/prizes'
import type { Contest, ContestCategory } from '@/types'
import ContestDetailJoin  from '@/components/contests/ContestDetailJoin'

// ── Type display config ───────────────────────────────────────────────────────

const TYPE_TO_CATEGORY: Record<string, ContestCategory> = {
  head_to_head:     'h2h',
  small_league:     'small_league',
  mega:             'mega',
  winner_takes_all: 'jackpot',
  practice:         'practice',
  public:           'small_league',
  private:          'small_league',
}

const CATEGORY_CONFIG: Record<ContestCategory, {
  icon: string; label: string; desc: string
  headerBg: string; headerText: string; accent: string; stripe: string
}> = {
  practice: {
    icon: '🎯', label: 'Practice', desc: 'Free practice — no prizes awarded',
    headerBg: 'bg-gray-100 border border-gray-200', headerText: 'text-gray-700',
    accent: 'text-gray-500', stripe: 'bg-gray-300',
  },
  h2h: {
    icon: '⚔️', label: 'Head to Head', desc: 'Winner takes all · 1v1 battle',
    headerBg: 'bg-blue-50 border border-blue-200', headerText: 'text-blue-900',
    accent: 'text-blue-600', stripe: 'bg-blue-500',
  },
  small_league: {
    icon: '👥', label: 'Small League', desc: 'Top players share the prize pool',
    headerBg: 'bg-green-50 border border-green-200', headerText: 'text-green-900',
    accent: 'text-green-600', stripe: 'bg-green-500',
  },
  jackpot: {
    icon: '🏆', label: 'Winner Takes All', desc: 'One winner, one massive prize',
    headerBg: 'bg-red-50 border border-red-200', headerText: 'text-red-900',
    accent: 'text-red-600', stripe: 'bg-red-500',
  },
  mega: {
    icon: '🔥', label: 'Mega Contest', desc: 'Top 30% of entrants win prizes',
    headerBg: 'bg-orange-50 border border-orange-200', headerText: 'text-orange-900',
    accent: 'text-orange-600', stripe: 'bg-[#C9A84C]',
  },
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}
function fmt(n: number) {
  if (n >= 1000) return `£${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
  return `£${n % 1 === 0 ? n : n.toFixed(2)}`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface EnteredTeam {
  id:           string
  user_id:      string
  team_name:    string
  display_name: string
  total_points: number
  is_me:        boolean
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ContestDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const club = await getClubBySlug(slug)
  if (!club) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const base = `/clubs/${slug}`

  // ── Contest ────────────────────────────────────────────────────────────────
  const { data: contestRow } = await supabase
    .from('contests')
    .select('*')
    .eq('id', id)
    .single()
  if (!contestRow) notFound()
  const c = contestRow as Contest

  // ── Match ──────────────────────────────────────────────────────────────────
  const { data: match } = c.match_id
    ? await supabase.from('matches').select('id, match_number, opponent, match_date, venue, status').eq('id', c.match_id).single()
    : { data: null }

  // ── Season (for wallet) + contest_team check ───────────────────────────────
  const userId = user?.id ?? ''
  const gwId   = ((c as unknown) as Record<string, unknown>).gameweek_id as string | null ?? null

  const [{ data: myTeam }, { data: wallet }, { data: myContestTeam }] = await Promise.all([
    c.season_id
      ? supabase.from('fantasy_teams').select('id').eq('season_id', c.season_id).eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('wallets').select('balance').eq('user_id', userId).maybeSingle(),
    gwId
      ? supabase.from('contest_teams').select('id').eq('contest_id', id).eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const myTeamId      = myTeam?.id ?? null
  const walletBalance = Number(wallet?.balance ?? 0)
  const hasContestTeam = !!myContestTeam

  // ── Entries ────────────────────────────────────────────────────────────────
  const { data: entries } = await supabase
    .from('contest_entries')
    .select('fantasy_team_id, joined_at')
    .eq('contest_id', id)
  const teamIds = (entries ?? []).map((e: { fantasy_team_id: string }) => e.fantasy_team_id)

  const { data: teams } = teamIds.length > 0
    ? await supabase.from('fantasy_teams')
        .select('id, team_name, total_points, user_id, profiles(display_name)')
        .in('id', teamIds)
        .order('total_points', { ascending: false })
    : { data: [] }

  const enteredTeams: EnteredTeam[] = (teams ?? []).map((t: Record<string, unknown>) => ({
    id:           t.id as string,
    user_id:      t.user_id as string,
    team_name:    t.team_name as string,
    display_name: (t.profiles as { display_name: string } | null)?.display_name ?? '—',
    total_points: Number(t.total_points ?? 0),
    is_me:        t.user_id === userId,
  }))

  // ── Derived contest metadata ───────────────────────────────────────────────
  const rawType    = (c.type ?? 'public') as string
  const category   = TYPE_TO_CATEGORY[rawType] ?? 'small_league'
  const cfg        = CATEGORY_CONFIG[category]
  const entryFee   = Number(c.entry_fee ?? 0)
  const maxTeams   = Number(c.max_entries ?? c.max_teams ?? 10)
  const platFee    = Number(c.platform_fee_pct ?? 15)
  const guaranteed = Boolean(c.is_guaranteed ?? c.guaranteed_prize ?? false)
  const entryCount = enteredTeams.length
  const prizePool  = guaranteed
    ? Number(c.prize_pool ?? netPrizePool(entryFee, maxTeams, platFee))
    : netPrizePool(entryFee, entryCount, platFee)
  const slots      = (c.prize_structure ?? []) as PrizeSlot[]
  const spotsLeft  = Math.max(0, maxTeams - entryCount)
  const pct        = maxTeams > 0 ? Math.min(100, Math.round((entryCount / maxTeams) * 100)) : 0
  const isFull     = spotsLeft === 0
  const isLocked   = match ? new Date(match.match_date) <= new Date() : false
  const isJoined   = myTeamId ? enteredTeams.some((t) => t.id === myTeamId) : false
  const myEntry    = myTeamId ? enteredTeams.find((t) => t.id === myTeamId) : null

  // H2H: find opponent
  const h2hOpponent = category === 'h2h' && enteredTeams.length > 0 && myEntry
    ? enteredTeams.find((t) => t.id !== myTeamId) ?? null
    : null

  return (
    <div className="space-y-6 pb-8">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href={`${base}/contests`} className="hover:text-[#C9A84C] transition-colors">Contests</Link>
        <span>/</span>
        <span className="text-gray-600 font-medium truncate">{c.name}</span>
      </div>

      {/* ── Hero header ───────────────────────────────────────────────────── */}
      <div className={cn('rounded-2xl px-6 py-5 relative overflow-hidden', cfg.headerBg)}>
        {/* Accent stripe */}
        <div className={cn('absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl', cfg.stripe)} />
        <div className="pl-2">
          {/* Type badge */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className={cn('inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded-full',
              category === 'h2h'          ? 'bg-blue-100 text-blue-700'   :
              category === 'small_league' ? 'bg-green-100 text-green-700' :
              category === 'jackpot'      ? 'bg-red-100 text-red-700'     :
              category === 'mega'         ? 'bg-orange-100 text-orange-700':
              'bg-gray-200 text-gray-600')}>
              <span>{cfg.icon}</span>{cfg.label}
            </span>
            {guaranteed && (
              <span className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                ✓ Guaranteed Prize
              </span>
            )}
            {isLocked && (
              <span className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full bg-gray-200 text-gray-600">
                🔒 Locked
              </span>
            )}
          </div>

          <h1 className={cn('text-2xl font-black leading-tight', cfg.headerText)}>{c.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{cfg.desc}</p>

          {/* Match info */}
          {match && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-sm font-semibold text-gray-700">
                🏏 vs {match.opponent}
              </span>
              <span className="text-sm text-gray-500">
                📅 {fmtDate(match.match_date)} · {fmtTime(match.match_date)}
              </span>
              {match.venue && <span className="text-sm text-gray-400">📍 {match.venue}</span>}
            </div>
          )}
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="Prize Pool" value={category === 'practice' ? 'Free' : prizePool > 0 ? fmt(prizePool) : '—'} gold={category !== 'practice'} />
        <StatBox label="Entry Fee"  value={entryFee === 0 ? 'Free' : fmt(entryFee)} />
        <StatBox label="Spots Left" value={isFull ? 'Full' : `${spotsLeft}`} red={isFull} />
      </div>

      {/* Spots bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5 text-xs">
          <span className="text-gray-500 font-medium">{entryCount} of {maxTeams} spots filled</span>
          <span className="text-gray-400">{pct}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all',
              pct >= 100 ? 'bg-red-400' : pct >= 80 ? 'bg-orange-400' : pct >= 50 ? 'bg-[#C9A84C]' : 'bg-green-400')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* ── Prize structure ────────────────────────────────────────────────── */}
      {category !== 'practice' && slots.length > 0 && (
        <PrizeBreakdown slots={slots} prizePool={prizePool} category={category} maxTeams={maxTeams} />
      )}

      {/* ── Join button (client component) ────────────────────────────────── */}
      {!isJoined && !isFull && !isLocked && myTeamId && (
        <ContestDetailJoin
          contestId={id}
          fantasyTeamId={myTeamId}
          entryFee={entryFee}
          walletBalance={walletBalance}
          clubSlug={slug}
          category={category}
          gameweekId={gwId}
          hasTeam={hasContestTeam}
        />
      )}
      {!myTeamId && !isJoined && (
        <div className="rounded-xl bg-[#fef9ee] border border-[#C9A84C]/30 px-4 py-3 text-sm text-[#a8892e] font-medium flex items-center justify-between gap-3">
          <span>Create a fantasy team to join this contest.</span>
          <Link href={`${base}/team`} className="bg-[#C9A84C] text-black px-3 py-1.5 rounded-lg text-xs font-black hover:bg-[#a8892e] transition-colors flex-shrink-0">
            Create Team
          </Link>
        </div>
      )}

      {/* Gameweek: show link to view/edit team picks */}
      {gwId && isJoined && (
        <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800 font-medium flex items-center justify-between gap-3">
          <span>✅ You&apos;re entered{hasContestTeam ? ' with your gameweek team.' : '.'}</span>
          <Link
            href={`${base}/contests/${id}/pick-team`}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-black hover:bg-blue-700 transition-colors flex-shrink-0"
          >
            View Team
          </Link>
        </div>
      )}

      {/* ── Entries section ────────────────────────────────────────────────── */}
      {category === 'h2h'
        ? <H2HLayout myEntry={myEntry} opponent={h2hOpponent} isLocked={isLocked} isJoined={isJoined} maxTeams={maxTeams} />
        : category === 'jackpot'
        ? <WtaLayout entries={enteredTeams} maxTeams={maxTeams} isLocked={isLocked} myEntry={myEntry} />
        : <StandardEntryList entries={enteredTeams} maxTeams={maxTeams} isLocked={isLocked} />
      }

    </div>
  )
}

// ── Prize breakdown ───────────────────────────────────────────────────────────

function PrizeBreakdown({ slots, prizePool, category, maxTeams }: {
  slots: PrizeSlot[]; prizePool: number; category: ContestCategory; maxTeams: number
}) {
  const medals = ['🥇', '🥈', '🥉', '🏅']
  const cfg = CATEGORY_CONFIG[category]
  return (
    <div className="rounded-2xl bg-[#fef9ee] border border-[#C9A84C]/30 overflow-hidden">
      <div className="px-5 py-3 border-b border-[#C9A84C]/20 flex items-center gap-2">
        <span className="text-base">🏆</span>
        <p className="text-sm font-black text-gray-800">Prize Structure</p>
        <span className="ml-auto text-sm font-black text-[#C9A84C]">{fmt(prizePool)} total</span>
      </div>
      <div className="divide-y divide-[#C9A84C]/10">
        {slots.map((slot, i) => {
          const amt = prizePool * slot.prize_pct / 100
          const rankLabel = slot.rank_from === slot.rank_to
            ? ordinal(slot.rank_from)
            : `${ordinal(slot.rank_from)} – ${ordinal(slot.rank_to)}`
          return (
            <div key={i} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{medals[i] ?? '🏅'}</span>
                <span className="text-sm font-semibold text-gray-700">{rankLabel}</span>
              </div>
              <div className="text-right">
                <p className="text-base font-black text-[#C9A84C]">{fmt(amt)}</p>
                <p className="text-[10px] text-gray-400">{slot.prize_pct}% of pool</p>
              </div>
            </div>
          )
        })}
      </div>
      {category === 'mega' && (
        <div className="px-5 py-2.5 bg-orange-50/50 border-t border-orange-100">
          <p className="text-xs text-orange-600 font-medium">
            Top {Math.max(1, Math.floor(maxTeams * 0.3))} of {maxTeams} entrants win prizes
          </p>
        </div>
      )}
    </div>
  )
}

// ── Stat box ──────────────────────────────────────────────────────────────────

function StatBox({ label, value, gold, red }: { label: string; value: string; gold?: boolean; red?: boolean }) {
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-3 text-center">
      <p className={cn('text-xl font-black tabular-nums', gold ? 'text-[#C9A84C]' : red ? 'text-red-500' : 'text-gray-800')}>
        {value}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

// ── H2H layout ────────────────────────────────────────────────────────────────

function H2HLayout({ myEntry, opponent, isLocked, isJoined, maxTeams }: {
  myEntry:  EnteredTeam | null | undefined
  opponent: EnteredTeam | null
  isLocked: boolean
  isJoined: boolean
  maxTeams: number
}) {
  return (
    <div className="rounded-2xl bg-blue-50 border border-blue-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-blue-100">
        <p className="text-sm font-black text-blue-800">⚔️ Head to Head</p>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-0">
        {/* My side */}
        <div className="p-5 flex flex-col items-center text-center">
          {myEntry ? (
            <>
              <div className="w-12 h-12 rounded-full bg-[#C9A84C] flex items-center justify-center text-black font-black text-lg mb-2">
                {myEntry.display_name.slice(0, 2).toUpperCase()}
              </div>
              <p className="text-sm font-black text-gray-800 truncate max-w-[120px]">{myEntry.team_name}</p>
              <p className="text-xs text-gray-500 truncate max-w-[120px]">{myEntry.display_name}</p>
              {isLocked && <p className="text-base font-black text-[#C9A84C] mt-1">{myEntry.total_points} pts</p>}
              <span className="mt-2 text-[10px] font-black bg-[#C9A84C] text-black px-2 py-0.5 rounded-full">YOU</span>
            </>
          ) : (
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xl mb-2">?</div>
          )}
          {!myEntry && !isJoined && (
            <p className="text-xs text-gray-400 mt-2">Your spot</p>
          )}
        </div>

        {/* VS divider */}
        <div className="flex flex-col items-center justify-center py-5 px-2">
          <span className="text-lg font-black text-blue-400">VS</span>
        </div>

        {/* Opponent side */}
        <div className="p-5 flex flex-col items-center text-center">
          {opponent && (isLocked || !isJoined) ? (
            <>
              <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-black text-lg mb-2">
                {opponent.display_name.slice(0, 2).toUpperCase()}
              </div>
              <p className="text-sm font-black text-gray-800 truncate max-w-[120px]">
                {isLocked ? opponent.team_name : '???'}
              </p>
              <p className="text-xs text-gray-500">{isLocked ? opponent.display_name : 'Hidden until lock'}</p>
              {isLocked && <p className="text-base font-black text-gray-700 mt-1">{opponent.total_points} pts</p>}
            </>
          ) : opponent && !isLocked ? (
            <>
              <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xl mb-2">🎭</div>
              <p className="text-xs text-gray-400 text-center">Team hidden<br/>until match starts</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300 text-xl mb-2">?</div>
              <p className="text-xs text-gray-400">Waiting for opponent</p>
              <p className="text-[10px] text-gray-300 mt-0.5">{maxTeams - (myEntry ? 1 : 0)} spot{maxTeams - (myEntry ? 1 : 0) !== 1 ? 's' : ''} left</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Winner Takes All bracket ──────────────────────────────────────────────────

function WtaLayout({ entries, maxTeams, isLocked, myEntry }: {
  entries:  EnteredTeam[]
  maxTeams: number
  isLocked: boolean
  myEntry:  EnteredTeam | null | undefined
}) {
  const slots = Array.from({ length: maxTeams }, (_, i) => entries[i] ?? null)

  return (
    <div className="rounded-2xl bg-red-50 border border-red-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-red-100">
        <p className="text-sm font-black text-red-800">🏆 Winner Takes All — Entrants</p>
        <p className="text-xs text-red-400 mt-0.5">Team details hidden until match starts</p>
      </div>
      <div className="p-4 grid grid-cols-1 gap-2">
        {slots.map((team, i) => {
          const isMe = team?.user_id === myEntry?.user_id
          return (
            <div key={i} className={cn(
              'flex items-center gap-3 rounded-xl px-4 py-3 border',
              team ? isMe ? 'bg-red-100 border-red-300' : 'bg-white border-red-100'
                   : 'bg-white/50 border-dashed border-red-200',
            )}>
              <span className={cn('text-lg font-black w-6 text-center flex-shrink-0',
                i === 0 ? 'text-[#C9A84C]' : 'text-gray-300')}>
                {i === 0 ? '🥇' : i + 1}
              </span>
              {team ? (
                <>
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0',
                    isMe ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600')}>
                    {isLocked ? team.display_name.slice(0, 2).toUpperCase() : '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {isLocked ? team.team_name : '??? (Hidden)'}
                      {isMe && <span className="ml-2 text-[10px] bg-[#C9A84C] text-black px-1.5 py-0.5 rounded font-black">YOU</span>}
                    </p>
                    <p className="text-xs text-gray-400">{isLocked ? team.display_name : 'Revealed at match start'}</p>
                  </div>
                  {isLocked && <span className="text-sm font-black text-gray-600 tabular-nums flex-shrink-0">{team.total_points}pts</span>}
                </>
              ) : (
                <p className="text-sm text-gray-300 italic">Open spot</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Standard entry list ───────────────────────────────────────────────────────

function StandardEntryList({ entries, maxTeams, isLocked }: {
  entries: EnteredTeam[]; maxTeams: number; isLocked: boolean
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl bg-gray-50 border border-gray-200 py-12 text-center">
        <div className="text-3xl mb-2">👥</div>
        <p className="text-gray-500 text-sm font-medium">No teams have joined yet.</p>
        <p className="text-gray-400 text-xs mt-1">Be the first to enter!</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-black text-gray-800">Teams Entered</p>
        <span className="text-xs text-gray-400">{entries.length} / {maxTeams}</span>
      </div>
      {!isLocked && (
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-100">
          <p className="text-xs text-amber-600 font-medium">🔒 Team names hidden until match starts</p>
        </div>
      )}
      <div className="divide-y divide-gray-50">
        {entries.map((team, i) => (
          <div key={team.id} className={cn('flex items-center gap-3 px-5 py-3',
            team.is_me ? 'bg-[#fef9ee]' : '')}>
            <span className="text-sm font-black text-gray-300 w-6 flex-shrink-0 tabular-nums">{i + 1}</span>
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0',
              team.is_me ? 'bg-[#C9A84C] text-black' : 'bg-gray-100 text-gray-500')}>
              {isLocked ? team.display_name.slice(0, 2).toUpperCase() : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5">
                {isLocked ? team.team_name : '??? Hidden'}
                {team.is_me && <span className="text-[9px] font-black bg-[#C9A84C] text-black px-1.5 py-0.5 rounded">YOU</span>}
              </p>
              <p className="text-xs text-gray-400 truncate">{isLocked ? team.display_name : 'Revealed at match start'}</p>
            </div>
            {isLocked && (
              <span className="text-sm font-black text-gray-600 tabular-nums flex-shrink-0">
                {team.total_points}pts
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
