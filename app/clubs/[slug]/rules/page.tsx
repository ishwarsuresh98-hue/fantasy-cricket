// Premium scoring rules page — black × gold × white palette

export default function RulesPage() {
  return (
    // Full-bleed dark canvas
    <div className="min-h-screen bg-[#0a0a0a] -mx-4 sm:-mx-6 px-4 sm:px-6 py-12">
      <div className="space-y-8">

        {/* ── Hero header ─────────────────────────────────────────────── */}
        <div className="text-center space-y-3 pb-4">
          {/* Gold shimmer pill */}
          <div className="inline-flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-full px-4 py-1.5 text-xs font-bold tracking-widest text-[#C9A84C] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] shadow-[0_0_6px_#C9A84C] inline-block" />
            The XI Fantasy Cricket
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
            Scoring{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#C9A84C] via-[#f0d078] to-[#a8892e]">
              Rules
            </span>
          </h1>
          <p className="text-white/40 text-sm max-w-md mx-auto">
            Every run, wicket, and catch earns your team points. Master the scoring
            system to build the perfect XI.
          </p>
          {/* Gold divider */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-[#C9A84C]/60" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]/60" />
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-[#C9A84C]/60" />
          </div>
        </div>

        {/* ── Batting ─────────────────────────────────────────────────── */}
        <GoldCard title="🏏 Batting" accent="batting">
          <ScoreTable rows={[
            { label: 'Run scored',           value: '1 pt',     type: 'pos-dim' },
            { label: 'Boundary (four)',       value: '+1 pt',    type: 'pos-dim' },
            { label: 'Six',                   value: '+2 pts',   type: 'pos' },
            { label: 'Half-century (50+)',    value: '+8 pts',   type: 'bonus' },
            { label: 'Century (100+)',        value: '+16 pts',  type: 'big-bonus' },
            { label: 'Duck (0 off ≥1 ball)', value: '−2 pts',   type: 'neg' },
          ]} />

          {/* SR sub-section */}
          <div className="mt-5 pt-5 border-t border-white/10">
            <p className="text-xs font-bold uppercase tracking-widest text-[#C9A84C]/80 mb-3">
              Strike Rate Bonus / Penalty
              <span className="ml-2 font-normal normal-case text-white/30 tracking-normal">
                min. 10 balls · batters, all-rounders &amp; keepers only
              </span>
            </p>
            <div className="space-y-1.5">
              {([
                { label: 'SR ≥ 150',   value: '+3 pts', type: 'big-bonus' },
                { label: 'SR 125–149', value: '+2 pts', type: 'bonus' },
                { label: 'SR 100–124', value: '+1 pt',  type: 'pos' },
                { label: 'SR 75–99',   value: '0 pts',  type: 'neutral' },
                { label: 'SR < 75',    value: '−2 pts', type: 'neg' },
              ] as Row[]).map(({ label, value, type }) => (
                <div key={label} className="flex items-center justify-between rounded-lg px-3 py-2 bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-sm text-white/70">{label}</span>
                  <ValueBadge value={value} type={type} />
                </div>
              ))}
            </div>
          </div>
        </GoldCard>

        {/* ── Bowling ─────────────────────────────────────────────────── */}
        <GoldCard title="🎳 Bowling" accent="bowling">
          <ScoreTable rows={[
            { label: 'Wicket',        value: '25 pts',   type: 'big-bonus' },
            { label: '3-wicket haul', value: '+4 pts',   type: 'pos' },
            { label: '4-wicket haul', value: '+8 pts',   type: 'bonus' },
            { label: '5-wicket haul', value: '+16 pts',  type: 'big-bonus' },
            { label: 'Dot ball',      value: '+1 pt',    type: 'pos-dim' },
            { label: 'Maiden over',   value: '+8 pts',   type: 'bonus' },
          ]} />
          <p className="mt-4 text-xs text-white/30 italic">
            Bowlers do not receive a strike-rate bonus or penalty.
          </p>
        </GoldCard>

        {/* ── Fielding ────────────────────────────────────────────────── */}
        <GoldCard title="🧤 Fielding" accent="fielding">
          <ScoreTable rows={[
            { label: 'Catch',    value: '8 pts',  type: 'pos' },
            { label: 'Stumping', value: '12 pts', type: 'bonus' },
            { label: 'Run out',  value: '6 pts',  type: 'pos' },
          ]} />
        </GoldCard>

        {/* ── Captain / Vice-Captain ──────────────────────────────────── */}
        <GoldCard title="⭐ Captain &amp; Vice-Captain" accent="captain">
          <div className="grid grid-cols-2 gap-4 mt-1">
            <MultiplierTile label="Captain" multiplier="2×" sub="base points" glow />
            <MultiplierTile label="Vice-Captain" multiplier="1.5×" sub="base points" />
          </div>
          <p className="mt-4 text-xs text-white/30 italic">
            Choose your captain and vice-captain wisely — they can make or break your score.
          </p>
        </GoldCard>

        {/* ── General Rules ────────────────────────────────────────────── */}
        <GoldCard title="📋 General Rules" accent="general">
          <ul className="space-y-3">
            {[
              'Pick 11 players from the confirmed squad within your budget.',
              'Teams lock when the match starts — no changes after lock.',
              'Points are calculated from the official Play Cricket scorecard.',
              'Did-not-bat players score 0 batting points (no duck penalty).',
              'Ties in contest leaderboards share the combined prize for those positions.',
            ].map((rule) => (
              <li key={rule} className="flex items-start gap-3 text-sm text-white/60">
                <span className="mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full bg-[#C9A84C]/60 shadow-[0_0_4px_#C9A84C]/60" />
                {rule}
              </li>
            ))}
          </ul>
        </GoldCard>

      </div>
    </div>
  )
}

// ── Types ──────────────────────────────────────────────────────────────────────

type PointType = 'big-bonus' | 'bonus' | 'pos' | 'pos-dim' | 'neutral' | 'neg'
interface Row { label: string; value: string; type: PointType }

// ── Primitives ─────────────────────────────────────────────────────────────────

function ValueBadge({ value, type }: { value: string; type: PointType }) {
  const styles: Record<PointType, string> = {
    'big-bonus': 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_8px_rgba(52,211,153,0.15)]',
    'bonus':     'bg-[#C9A84C]/15 text-[#C9A84C] border border-[#C9A84C]/30',
    'pos':       'bg-[#C9A84C]/10 text-[#C9A84C]/80 border border-[#C9A84C]/20',
    'pos-dim':   'bg-white/5 text-white/50 border border-white/10',
    'neutral':   'bg-white/5 text-white/30 border border-white/10',
    'neg':       'bg-red-500/10 text-red-400 border border-red-500/20',
  }
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-black tabular-nums ${styles[type]}`}>
      {value}
    </span>
  )
}

function ScoreTable({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-1">
      {rows.map(({ label, value, type }) => (
        <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
          <span className="text-sm text-white/65">{label}</span>
          <ValueBadge value={value} type={type} />
        </div>
      ))}
    </div>
  )
}

function MultiplierTile({ label, multiplier, sub, glow = false }: {
  label: string; multiplier: string; sub: string; glow?: boolean
}) {
  return (
    <div className={`relative rounded-xl border p-4 text-center overflow-hidden ${
      glow
        ? 'bg-gradient-to-b from-[#C9A84C]/15 to-[#C9A84C]/5 border-[#C9A84C]/40 shadow-[0_0_20px_rgba(201,168,76,0.15)]'
        : 'bg-white/[0.03] border-white/10'
    }`}>
      {glow && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C9A84C]/60 to-transparent" />
      )}
      <p className="text-xs text-white/40 font-medium mb-1">{label}</p>
      <p className={`text-4xl font-black tabular-nums ${glow ? 'text-[#C9A84C]' : 'text-white/80'}`}>
        {multiplier}
      </p>
      <p className="text-xs text-white/30 mt-0.5">{sub}</p>
    </div>
  )
}

function GoldCard({ title, children, accent: _accent }: {
  title: string; children: React.ReactNode; accent?: string
}) {
  return (
    <section className="relative rounded-2xl overflow-hidden border border-[#C9A84C]/20 bg-[#111111] shadow-[0_2px_24px_rgba(0,0,0,0.6)]">
      {/* Top gold line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C9A84C]/50 to-transparent" />

      {/* Header */}
      <div className="relative px-5 py-4 bg-gradient-to-r from-[#C9A84C]/10 via-[#C9A84C]/5 to-transparent border-b border-[#C9A84C]/15">
        <h2 className="font-black text-base tracking-wide text-[#C9A84C]"
            dangerouslySetInnerHTML={{ __html: title }} />
      </div>

      {/* Body */}
      <div className="px-5 py-5">
        {children}
      </div>

      {/* Bottom corner glow */}
      <div className="pointer-events-none absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-[#C9A84C]/5 blur-2xl" />
    </section>
  )
}
