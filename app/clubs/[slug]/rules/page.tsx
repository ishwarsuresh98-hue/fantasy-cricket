export default function RulesPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8 py-6 px-4">
      <div>
        <h1 className="text-3xl font-bold text-[#C9A84C]">Scoring Rules</h1>
        <p className="text-gray-500 mt-1 text-sm">
          How fantasy points are calculated for each player each match.
        </p>
      </div>

      {/* ── Batting ─────────────────────────────────────────────────────── */}
      <Section title="🏏 Batting">
        <Table rows={[
          ['Run scored',        '1 pt each'],
          ['Boundary (four)',   '+1 pt each'],
          ['Six',               '+2 pts each'],
          ['Half-century (50+)', '+8 pts bonus'],
          ['Century (100+)',    '+16 pts bonus'],
          ['Duck (0 off ≥1 ball)', '−2 pts'],
        ]} />

        <h3 className="font-semibold text-sm text-gray-700 mt-4 mb-2">Strike Rate Bonus / Penalty <span className="font-normal text-gray-400">(min. 10 balls faced · batsmen, all-rounders &amp; keepers only)</span></h3>
        <Table rows={[
          ['SR ≥ 150', '+3 pts'],
          ['SR 125–149', '+2 pts'],
          ['SR 100–124', '+1 pt'],
          ['SR 75–99',   '0 pts'],
          ['SR < 75',   '−2 pts'],
        ]} />
      </Section>

      {/* ── Bowling ─────────────────────────────────────────────────────── */}
      <Section title="🎳 Bowling">
        <Table rows={[
          ['Wicket',            '25 pts each'],
          ['3-wicket haul',    '+4 pts bonus'],
          ['4-wicket haul',    '+8 pts bonus'],
          ['5-wicket haul',    '+16 pts bonus'],
          ['Dot ball',          '+1 pt each'],
          ['Maiden over',       '+8 pts bonus'],
        ]} />
        <p className="text-xs text-gray-400 mt-2">Bowlers do not receive a strike-rate bonus or penalty.</p>
      </Section>

      {/* ── Fielding ────────────────────────────────────────────────────── */}
      <Section title="🧤 Fielding">
        <Table rows={[
          ['Catch',    '8 pts each'],
          ['Stumping', '12 pts each'],
          ['Run out',  '6 pts each'],
        ]} />
      </Section>

      {/* ── Captain / Vice-Captain ──────────────────────────────────────── */}
      <Section title="⭐ Captain &amp; Vice-Captain Multipliers">
        <Table rows={[
          ['Captain',      '2× base points'],
          ['Vice-Captain', '1.5× base points'],
        ]} />
        <p className="text-xs text-gray-400 mt-2">
          Choose your captain and vice-captain wisely — they can make or break your score.
        </p>
      </Section>

      {/* ── General ─────────────────────────────────────────────────────── */}
      <Section title="📋 General Rules">
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1.5">
          <li>Pick 11 players from the confirmed squad within your budget.</li>
          <li>Teams lock when the match starts — no changes after lock.</li>
          <li>Points are calculated from the official Play Cricket scorecard.</li>
          <li>Did-not-bat players score 0 batting points (no duck penalty).</li>
          <li>Ties in contest leaderboards share the combined prize for those positions.</li>
        </ul>
      </Section>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-3">
        <h2 className="font-bold text-sm text-gray-800">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-gray-100">
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td className="py-2 pr-4 text-gray-600">{label}</td>
            <td className="py-2 text-right font-semibold text-gray-800">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
