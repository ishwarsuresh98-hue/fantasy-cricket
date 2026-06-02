// ── The XI — Scoring Rules (premium redesign) ─────────────────────────────────

export default function RulesPage() {
  return (
    <div className="min-h-screen bg-white -mx-4 sm:-mx-6 px-4 sm:px-6 pb-16">

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <div className="py-14 text-center relative overflow-hidden">
        {/* Background radial glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[600px] h-[300px] rounded-full bg-[#C9A84C]/8 blur-[80px]" />
        </div>
        <p className="relative text-[#C9A84C] text-xs font-black uppercase tracking-[0.25em] mb-4">
          The XI Fantasy Cricket
        </p>
        <h1 className="relative text-5xl sm:text-7xl font-black tracking-tighter text-[#111111] leading-none">
          HOW TO<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#C9A84C] via-[#f5d97a] to-[#C9A84C]">
            SCORE POINTS
          </span>
        </h1>
        <p className="relative mt-5 text-[#111111]/35 text-sm max-w-lg mx-auto leading-relaxed">
          Every run, wicket, catch and dot ball earns your fantasy team points.
          Master this and you&apos;ll master the game.
        </p>
      </div>

      <div className="space-y-12">

        {/* ══════════════════════════════════════════════════════════════════
            BATTING
        ══════════════════════════════════════════════════════════════════ */}
        <Section
          label="Batting"
          color="from-blue-500/20 to-transparent"
          borderColor="border-blue-500/30"
          accentColor="text-blue-400"
        >
          {/* Main batting grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatTile label="Run scored"    pts="1"   unit="pt"  color="green-dim" wide />
            <StatTile label="Four"          pts="+1"  unit="pt"  color="green-dim" wide />
            <StatTile label="Six"           pts="+2"  unit="pts" color="green" wide />
            <StatTile label="Half-century"  pts="+8"  unit="pts" color="gold" wide sub="50+ runs" />
            <StatTile label="Century"       pts="+16" unit="pts" color="emerald" wide sub="100+ runs" />
            <StatTile label="Duck"          pts="−2"  unit="pts" color="red" wide sub="0 off ≥1 ball" />
          </div>

          {/* Strike rate spectrum */}
          <div className="mt-6 rounded-2xl bg-gray-50 border border-gray-200 p-5">
            <p className="text-xs font-black uppercase tracking-widest text-[#111111]/40 mb-1">
              Strike Rate Bonus / Penalty
            </p>
            <p className="text-[11px] text-[#111111]/25 mb-4">
              Min. 10 balls faced · batters, all-rounders &amp; keepers only
            </p>
            <div className="grid grid-cols-5 gap-2">
              {([
                { range: 'SR < 75',    pts: '−2', color: 'red'      },
                { range: 'SR 75–99',   pts: '0',  color: 'neutral'  },
                { range: 'SR 100–124', pts: '+1', color: 'green-dim'},
                { range: 'SR 125–149', pts: '+2', color: 'gold'     },
                { range: 'SR ≥ 150',   pts: '+3', color: 'emerald'  },
              ] as { range: string; pts: string; color: ColorKey }[]).map(({ range, pts, color }) => (
                <div key={range} className={`rounded-xl p-3 text-center border ${srColors[color]}`}>
                  <p className={`text-xl font-black tabular-nums ${srPtColor[color]}`}>{pts}</p>
                  <p className="text-[10px] text-[#111111]/40 mt-1 leading-tight">{range}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            BOWLING
        ══════════════════════════════════════════════════════════════════ */}
        <Section
          label="Bowling"
          color="from-emerald-500/20 to-transparent"
          borderColor="border-emerald-500/30"
          accentColor="text-emerald-400"
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Wicket — hero tile spans 2 cols */}
            <div className="col-span-2 sm:col-span-1 row-span-2 relative rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/15 to-emerald-500/5 p-6 flex flex-col items-center justify-center text-center overflow-hidden shadow-[0_0_40px_rgba(52,211,153,0.1)]">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
              <p className="text-6xl font-black text-emerald-400 tabular-nums leading-none">25</p>
              <p className="text-emerald-400/60 text-xs font-bold uppercase tracking-widest mt-1">pts</p>
              <p className="text-[#111111]/60 text-sm font-semibold mt-3">Wicket</p>
              <p className="text-[#111111]/25 text-xs mt-1">per dismissal</p>
            </div>
            <StatTile label="3-wicket haul" pts="+4"  unit="pts" color="green"   sub="bonus" />
            <StatTile label="4-wicket haul" pts="+8"  unit="pts" color="gold"    sub="bonus" />
            <StatTile label="5-wicket haul" pts="+16" unit="pts" color="emerald" sub="bonus" />
            <StatTile label="Dot ball"      pts="+1"  unit="pt"  color="green-dim" />
            <StatTile label="Maiden over"   pts="+8"  unit="pts" color="gold" />
          </div>
          <p className="mt-3 text-xs text-[#111111]/25 italic">
            Bowlers do not receive a strike-rate bonus or penalty.
          </p>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            FIELDING
        ══════════════════════════════════════════════════════════════════ */}
        <Section
          label="Fielding"
          color="from-amber-500/20 to-transparent"
          borderColor="border-amber-500/30"
          accentColor="text-amber-400"
        >
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Catch"    pts="8"  unit="pts" color="gold"    wide />
            <StatTile label="Stumping" pts="12" unit="pts" color="emerald" wide />
            <StatTile label="Run Out"  pts="6"  unit="pts" color="green"   wide />
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            CAPTAIN & VICE-CAPTAIN
        ══════════════════════════════════════════════════════════════════ */}
        <Section
          icon="⭐"
          label="Captain & Vice-Captain"
          color="from-[#C9A84C]/25 to-transparent"
          borderColor="border-[#C9A84C]/40"
          accentColor="text-[#C9A84C]"
        >
          <div className="grid grid-cols-2 gap-4">
            {/* Captain */}
            <div className="relative rounded-2xl border border-[#C9A84C]/40 bg-gradient-to-b from-[#C9A84C]/15 to-[#C9A84C]/5 p-6 text-center overflow-hidden shadow-[0_0_40px_rgba(201,168,76,0.15)]">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C9A84C]/70 to-transparent" />
              <p className="text-xs text-[#111111]/40 font-bold uppercase tracking-widest mb-2">Captain</p>
              <p className="text-7xl font-black text-[#C9A84C] leading-none tabular-nums">2×</p>
              <p className="text-[#111111]/35 text-sm mt-3">all base points</p>
            </div>
            {/* Vice-Captain */}
            <div className="relative rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center overflow-hidden">
              <p className="text-xs text-[#111111]/40 font-bold uppercase tracking-widest mb-2">Vice-Captain</p>
              <p className="text-7xl font-black text-[#111111]/70 leading-none tabular-nums">1.5×</p>
              <p className="text-[#111111]/35 text-sm mt-3">all base points</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-[#111111]/25 text-center italic">
            Choose wisely — your captain can single-handedly win you the contest.
          </p>
        </Section>

        {/* ══════════════════════════════════════════════════════════════════
            GENERAL RULES
        ══════════════════════════════════════════════════════════════════ */}
        <Section
          icon="📋"
          label="General Rules"
          color="from-slate-500/20 to-transparent"
          borderColor="border-slate-500/20"
          accentColor="text-slate-400"
        >
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { icon: '👥', rule: 'Pick 11 players from the confirmed squad within your budget.' },
              { icon: '🔒', rule: 'Teams lock when the match starts — no changes after lock.' },
              { icon: '📊', rule: 'Points are calculated from the official Play Cricket scorecard.' },
              { icon: '🏏', rule: 'Did-not-bat players score 0 batting points — no duck penalty.' },
              { icon: '🤝', rule: 'Ties share the combined prize for those positions.' },
            ].map(({ icon, rule }) => (
              <div key={rule} className="flex items-start gap-3 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
                <span className="text-xl shrink-0 mt-0.5">{icon}</span>
                <p className="text-sm text-[#111111]/55 leading-snug">{rule}</p>
              </div>
            ))}
          </div>
        </Section>

      </div>
    </div>
  )
}

// ── Types ──────────────────────────────────────────────────────────────────────

type ColorKey = 'emerald' | 'gold' | 'green' | 'green-dim' | 'red' | 'neutral'

// ── Colour maps ────────────────────────────────────────────────────────────────

const tileBg: Record<ColorKey, string> = {
  emerald:    'bg-emerald-500/10 border-emerald-500/25 shadow-[0_0_20px_rgba(52,211,153,0.07)]',
  gold:       'bg-[#C9A84C]/10 border-[#C9A84C]/25',
  green:      'bg-green-500/10 border-green-500/25',
  'green-dim':'bg-gray-50 border-gray-200',
  red:        'bg-red-500/10 border-red-500/25',
  neutral:    'bg-gray-50 border-gray-200',
}

const tileNum: Record<ColorKey, string> = {
  emerald:    'text-emerald-400',
  gold:       'text-[#C9A84C]',
  green:      'text-green-400',
  'green-dim':'text-[#111111]/55',
  red:        'text-red-400',
  neutral:    'text-[#111111]/25',
}

const srColors: Record<ColorKey, string> = {
  emerald:    'bg-emerald-500/10 border-emerald-500/25',
  gold:       'bg-[#C9A84C]/10 border-[#C9A84C]/25',
  green:      'bg-green-500/10 border-green-500/25',
  'green-dim':'bg-gray-50 border-gray-200',
  red:        'bg-red-500/10 border-red-500/25',
  neutral:    'bg-gray-50 border-gray-200',
}

const srPtColor: Record<ColorKey, string> = tileNum

// ── Components ─────────────────────────────────────────────────────────────────

function Section({ icon, label, color, borderColor, accentColor, children }: {
  icon?: string; label: string
  color: string; borderColor: string; accentColor: string
  children: React.ReactNode
}) {
  return (
    <section>
      {/* Section header */}
      <div className={`flex items-center gap-3 mb-5 pb-4 border-b ${borderColor}`}>
        {icon && (
          <div className={`text-3xl w-12 h-12 flex items-center justify-center rounded-xl bg-gradient-to-br ${color} border ${borderColor} shrink-0`}>
            {icon}
          </div>
        )}
        <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${accentColor}`}>{label}</h2>
      </div>
      {children}
    </section>
  )
}

function StatTile({ label, pts, unit, color, sub, wide: _wide }: {
  label: string; pts: string; unit: string; color: ColorKey; sub?: string; wide?: boolean
}) {
  return (
    <div className={`relative rounded-xl border p-4 flex flex-col items-center justify-center text-center overflow-hidden ${tileBg[color]}`}>
      <p className={`text-3xl font-black tabular-nums leading-none ${tileNum[color]}`}>{pts}</p>
      <p className={`text-[10px] font-bold tabular-nums ${tileNum[color]} opacity-60 mt-0.5`}>{unit}</p>
      <p className="text-xs text-[#111111]/55 font-semibold mt-2 leading-tight">{label}</p>
      {sub && <p className="text-[10px] text-[#111111]/25 mt-0.5">{sub}</p>}
    </div>
  )
}
