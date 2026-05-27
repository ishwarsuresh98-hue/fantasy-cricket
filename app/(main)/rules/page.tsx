import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function RulesPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[#C9A84C]">Rules & Scoring</h1>
        <p className="text-muted-foreground mt-1">
          Everything you need to know to play Slough CC Fantasy League.
        </p>
      </div>

      {/* How to Play */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#C9A84C] flex items-center gap-2">
            🏏 How to Play
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[#aaaaaa] leading-relaxed">
          <p>
            Each gameweek is a <strong>single calendar day</strong>. When Slough CC have multiple matches on the same day,
            all confirmed players across every XI form a <strong>combined player pool</strong> for that gameweek.
            Pick your best 11 before the deadline, and earn points from every player's actual performance.
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>Pick <strong>1–4 Wicket-Keepers</strong>, <strong>3–6 Batsmen</strong>, <strong>1–4 All-Rounders</strong>, and <strong>3–6 Bowlers</strong> — exactly 11 in total.</li>
            <li>Stay within the <strong>100 credit budget</strong> (each player has a credit value between 6.0–11.0).</li>
            <li>Designate one player as <strong>Captain</strong> (2× points) and one as <strong>Vice-Captain</strong> (1.5× points).</li>
            <li>Your total score is the sum of points earned by all 11 players, with captain/VC multipliers applied.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Gameweek & Deadlines */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#C9A84C] flex items-center gap-2">
            📅 Gameweeks & Deadlines
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-[#aaaaaa] leading-relaxed">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border bg-[#1c1c1c] border-[#C9A84C]/20 text-center">
              <p className="text-2xl font-bold text-[#C9A84C]">1 day</p>
              <p className="text-xs text-muted-foreground mt-1">= 1 gameweek</p>
            </div>
            <div className="p-3 rounded-lg border bg-[#fef9ee] border-[#C9A84C]/60 text-center">
              <p className="text-2xl font-bold text-[#C9A84C]">−30 min</p>
              <p className="text-xs text-muted-foreground mt-1">before earliest match</p>
            </div>
            <div className="p-3 rounded-lg border bg-blue-50 border-blue-200 text-center">
              <p className="text-2xl font-bold text-[#C9A84C]">All XIs</p>
              <p className="text-xs text-muted-foreground mt-1">form one combined pool</p>
            </div>
          </div>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>A <strong>gameweek</strong> is one calendar day — all matches played on that day count together.</li>
            <li>The <strong>deadline</strong> is 30 minutes before the earliest match on that day. Once it passes, your team is locked in.</li>
            <li>Admin confirms the <strong>playing XI</strong> for each match 1–2 days in advance — only confirmed players appear in the player pool.</li>
            <li>Players from <strong>all matches on that day</strong> are pooled together, so you can mix players from the 1st XI, 2nd XI, and beyond in the same squad.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Transfers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#C9A84C] flex items-center gap-2">
            🔄 Transfers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-[#aaaaaa] leading-relaxed">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border bg-[#1c1c1c] border-[#C9A84C]/20 text-center">
              <p className="text-2xl font-bold text-[#C9A84C]">300</p>
              <p className="text-xs text-muted-foreground mt-1">transfers per season</p>
            </div>
            <div className="p-3 rounded-lg border bg-green-50 border-green-200 text-center">
              <p className="text-2xl font-bold text-green-700">Free</p>
              <p className="text-xs text-muted-foreground mt-1">before deadline</p>
            </div>
            <div className="p-3 rounded-lg border bg-red-50 border-red-200 text-center">
              <p className="text-2xl font-bold text-[#b5211e]">1</p>
              <p className="text-xs text-muted-foreground mt-1">transfer per player swap</p>
            </div>
          </div>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>Each team gets <strong>300 transfers</strong> for the entire season — not per gameweek.</li>
            <li>Every player swap counts as <strong>1 transfer</strong>. Bringing in 3 new players = 3 transfers.</li>
            <li>Transfers are <strong>only deducted when the matchday deadline passes</strong>. Until then, you can freely change your team as many times as you like without using any transfers — it's just previewing.</li>
            <li>Once the deadline passes, the number of players different from your previous matchday squad is deducted from your transfer balance.</li>
            <li>When all 300 transfers are used, your team is <strong>locked for the rest of the season</strong> — no further changes.</li>
            <li>The <strong>Mega Transfer</strong> booster gives unlimited swaps for one matchday without touching your transfer quota.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Player Credits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#C9A84C] flex items-center gap-2">
            💰 Player Credits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-[#aaaaaa] leading-relaxed">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border bg-[#1c1c1c] border-[#C9A84C]/20 text-center">
              <p className="text-2xl font-bold text-[#C9A84C]">6.0 – 11.0</p>
              <p className="text-xs text-muted-foreground mt-1">credit range</p>
            </div>
            <div className="p-3 rounded-lg border bg-green-50 border-green-200 text-center">
              <p className="text-2xl font-bold text-green-700">+0.5</p>
              <p className="text-xs text-muted-foreground mt-1">above matchday average</p>
            </div>
            <div className="p-3 rounded-lg border bg-red-50 border-red-200 text-center">
              <p className="text-2xl font-bold text-[#b5211e]">−0.5</p>
              <p className="text-xs text-muted-foreground mt-1">below matchday average</p>
            </div>
          </div>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>All players start with a credit value between <strong>6.0 and 11.0</strong>.</li>
            <li>After each match, credits are automatically adjusted: <strong>+0.5</strong> if a player scored above the matchday average; <strong>−0.5</strong> if below.</li>
            <li>Credits cannot go below <strong>6.0</strong> or above <strong>11.0</strong>.</li>
            <li>Credit arrows on the team page (<span className="text-green-600 font-bold">↑</span> / <span className="text-red-500 font-bold">↓</span>) show which direction a player's price moved after the last match.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Squad Selection Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#C9A84C] flex items-center gap-2">
            📋 Squad Selection Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-[#aaaaaa]">
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { role: 'Wicket-Keepers', range: '1 – 4', color: 'bg-[#fef9ee] text-[#C9A84C] border-yellow-200' },
              { role: 'Batsmen', range: '3 – 6', color: 'bg-blue-50 text-blue-700 border-blue-200' },
              { role: 'All-Rounders', range: '1 – 4', color: 'bg-[#1c1c1c] text-[#C9A84C] border-[#C9A84C]/20' },
              { role: 'Bowlers', range: '3 – 6', color: 'bg-[#fceaea] text-[#b5211e] border-red-200' },
            ].map(({ role, range, color }) => (
              <div key={role} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${color}`}>
                <span className="font-medium">{role}</span>
                <Badge className={`${color.split(' ').slice(0, 2).join(' ')} hover:opacity-100 text-xs font-bold border-0`}>{range}</Badge>
              </div>
            ))}
          </div>
          <ul className="list-disc list-inside space-y-1.5 pl-2 text-gray-600">
            <li>Total squad size is exactly <strong>11 players</strong>.</li>
            <li>Stay within the <strong>100 credit budget</strong>.</li>
            <li>You may pick players from <strong>any match on that gameweek day</strong> — mix players from the 1st XI and 2nd XI freely.</li>
            <li><strong>Free Hit</strong> removes the budget cap for one match — pick any players regardless of cost.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Points System */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#C9A84C] flex items-center gap-2">
            📊 Points System
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Batting */}
          <div>
            <h3 className="font-semibold text-[#C9A84C] mb-3">
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">BATTING</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-muted-foreground font-medium">Action</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr><td className="py-2">Run scored</td><td className="text-right font-semibold">+1 per run</td></tr>
                  <tr><td className="py-2">Four hit</td><td className="text-right font-semibold">+1 per four</td></tr>
                  <tr><td className="py-2">Six hit</td><td className="text-right font-semibold">+2 per six</td></tr>
                  <tr><td className="py-2">Half-century (50+ runs)</td><td className="text-right font-semibold text-green-700">+8 bonus</td></tr>
                  <tr><td className="py-2">Century (100+ runs)</td><td className="text-right font-semibold text-green-700">+16 bonus</td></tr>
                  <tr><td className="py-2 text-red-600">Duck (0 runs, faced balls)</td><td className="text-right font-semibold text-red-600">−2</td></tr>
                  <tr className="border-t border-dashed">
                    <td colSpan={2} className="pt-3 pb-1 text-xs text-muted-foreground font-medium uppercase tracking-wide">Strike Rate (min. 10 balls faced)</td>
                  </tr>
                  <tr><td className="py-1 pl-3">SR &lt; 75</td><td className="text-right font-semibold text-red-600">−2</td></tr>
                  <tr><td className="py-1 pl-3">SR 75 – 100</td><td className="text-right font-semibold text-muted-foreground">0</td></tr>
                  <tr><td className="py-1 pl-3">SR 100 – 125</td><td className="text-right font-semibold text-green-700">+1</td></tr>
                  <tr><td className="py-1 pl-3">SR 125 – 150</td><td className="text-right font-semibold text-green-700">+2</td></tr>
                  <tr><td className="py-2 pl-3">SR &gt; 150</td><td className="text-right font-semibold text-green-700">+3</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Bowling */}
          <div>
            <h3 className="font-semibold text-[#C9A84C] mb-3">
              <span className="bg-[#fceaea] text-[#b5211e] px-2 py-0.5 rounded text-xs font-bold">BOWLING</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-muted-foreground font-medium">Action</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr><td className="py-2">Wicket taken</td><td className="text-right font-semibold">+25 per wicket</td></tr>
                  <tr><td className="py-2">3-wicket haul</td><td className="text-right font-semibold text-green-700">+4 bonus</td></tr>
                  <tr><td className="py-2">4-wicket haul</td><td className="text-right font-semibold text-green-700">+8 bonus</td></tr>
                  <tr><td className="py-2">5-wicket haul</td><td className="text-right font-semibold text-green-700">+16 bonus</td></tr>
                  <tr><td className="py-2">Dot ball</td><td className="text-right font-semibold text-green-700">+1 per dot ball</td></tr>
                  <tr><td className="py-2">Maiden over</td><td className="text-right font-semibold text-green-700">+8 bonus</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Fielding */}
          <div>
            <h3 className="font-semibold text-[#C9A84C] mb-3">
              <span className="bg-[#1c1c1c] text-[#C9A84C] px-2 py-0.5 rounded text-xs font-bold">FIELDING</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-muted-foreground font-medium">Action</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr><td className="py-2">Catch</td><td className="text-right font-semibold">+8 per catch</td></tr>
                  <tr><td className="py-2">Stumping</td><td className="text-right font-semibold">+12 per stumping</td></tr>
                  <tr><td className="py-2">Run out</td><td className="text-right font-semibold">+6 per run out</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Captain / VC */}
          <div>
            <h3 className="font-semibold text-[#C9A84C] mb-3">
              <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-xs font-bold">CAPTAIN & VICE-CAPTAIN</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-muted-foreground font-medium">Role</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Multiplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="py-2">Captain <Badge className="ml-1 bg-yellow-100 text-yellow-700 hover:bg-yellow-100 text-xs">C</Badge></td>
                    <td className="text-right font-semibold">2× points</td>
                  </tr>
                  <tr>
                    <td className="py-2">Vice-Captain <Badge className="ml-1 bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs">VC</Badge></td>
                    <td className="text-right font-semibold">1.5× points</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Boosters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#C9A84C] flex items-center gap-2">
            ⚡ Boosters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Each team gets 9 boosters to use across the season. Only one booster may be activated per match. Once activated it cannot be changed.
          </p>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Once per season</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { icon: '🏏', name: 'Batting Surge', uses: '1×', desc: 'All batsmen & all-rounders in your XI earn 2× points for that match.' },
                { icon: '⚡', name: 'Bowling Surge', uses: '1×', desc: 'All bowlers & all-rounders in your XI earn 2× points for that match.' },
                { icon: '🧤', name: 'Keeping Surge', uses: '1×', desc: 'Your wicket-keeper earns 2× points for that match.' },
                { icon: '🆓', name: 'Free Hit', uses: '1×', desc: 'No budget restriction this match — pick any players. Your squad automatically reverts after.' },
              ].map(({ icon, name, uses, desc }) => (
                <div key={name} className="flex gap-3 p-3 rounded-lg border bg-[#f8f8f8]">
                  <span className="text-2xl shrink-0">{icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#C9A84C]">{name}</p>
                      <Badge className="bg-[#f0f0f0] text-[#0b0b0b] hover:bg-[#f0f0f0] text-xs px-1.5">{uses} per season</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Twice per season</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { icon: '👑', name: 'Triple Captain', uses: '2×', desc: 'Choose one player to earn 3× points — overrides the usual captain 2×.' },
                { icon: '🔄', name: 'Mega Transfer', uses: '2×', desc: 'Make unlimited transfers for one matchday without using your season transfer quota.' },
                { icon: '💥', name: 'Double Power', uses: '2×', desc: 'Every player in your XI earns 2× points for that match.' },
                { icon: '🧊', name: 'Score Freeze', uses: '2×', desc: 'Lock in your current season total as a guaranteed floor. If your team scores less than that floor this matchday, the shortfall is topped up automatically. If you score more, you get the higher score.' },
                { icon: '🎲', name: 'Underdog', uses: '2×', desc: 'If your team scores below the matchday average your points are doubled. If you score above average, points are normal. Rewards risk-taking and keeps lower-ranked managers competitive.' },
              ].map(({ icon, name, uses, desc }) => (
                <div key={name} className="flex gap-3 p-3 rounded-lg border bg-[#fef9ee] border-[#C9A84C]/60">
                  <span className="text-2xl shrink-0">{icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#C9A84C]">{name}</p>
                      <Badge className="bg-[#C9A84C] text-[#0b0b0b] hover:bg-[#C9A84C] text-xs px-1.5 font-bold">{uses} per season</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* General Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#C9A84C] flex items-center gap-2">
            📌 General Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-[#aaaaaa] space-y-2 leading-relaxed">
          <ul className="list-disc list-inside space-y-2 pl-2">
            <li>Squads must be submitted <strong>before the matchday deadline</strong> (30 minutes before the earliest match on that day). Late submissions will not count.</li>
            <li>You can change your team freely before the deadline — transfers are only counted when the deadline passes.</li>
            <li>Points are calculated automatically once match stats are entered by an admin.</li>
            <li>The overall leaderboard ranks teams by <strong>total cumulative points</strong> across all gameweeks.</li>
            <li>If a player in your XI did not bat (<em>Did Not Bat</em>), they score 0 batting points — no duck penalty applies.</li>
            <li>Booster effects are applied automatically during scoring — no manual action is needed after activation.</li>
            <li>Only <strong>one booster</strong> may be activated per matchday per team.</li>
            <li>In the event of a tie on points, teams are ranked by the higher captain score.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
