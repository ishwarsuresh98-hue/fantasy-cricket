import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function RulesPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[#262162]">Rules & Scoring</h1>
        <p className="text-muted-foreground mt-1">
          Everything you need to know to play Slough CC Fantasy League.
        </p>
      </div>

      {/* How to play */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#262162] flex items-center gap-2">
            🏏 How to Play
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            Each player picks a squad of <strong>11 players</strong> from the available pool before each match.
            Your squad earns points based on how those players actually perform on the day.
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2">
            <li>Pick <strong>1–4 Wicket-Keepers</strong>, <strong>3–6 Batsmen</strong>, <strong>1–4 All-Rounders</strong>, and <strong>3–6 Bowlers</strong> — exactly 11 in total.</li>
            <li>Stay within the <strong>budget cap</strong> (each player has a price).</li>
            <li>Designate one player as <strong>Captain</strong> (2× points) and one as <strong>Vice-Captain</strong> (1.5× points).</li>
            <li>Your total score is the sum of points earned by all 11 players, with captain/VC multipliers applied.</li>
            <li>You can change your squad freely before each match's deadline.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Points system */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#262162] flex items-center gap-2">
            📊 Points System
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Batting */}
          <div>
            <h3 className="font-semibold text-[#262162] mb-3 flex items-center gap-2">
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
            <h3 className="font-semibold text-[#262162] mb-3">
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
            <h3 className="font-semibold text-[#262162] mb-3">
              <span className="bg-[#eeedf8] text-[#262162] px-2 py-0.5 rounded text-xs font-bold">FIELDING</span>
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
            <h3 className="font-semibold text-[#262162] mb-3">
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
                  <tr><td className="py-2">Captain <Badge className="ml-1 bg-yellow-100 text-yellow-700 hover:bg-yellow-100 text-xs">C</Badge></td><td className="text-right font-semibold">2× points</td></tr>
                  <tr><td className="py-2">Vice-Captain <Badge className="ml-1 bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs">VC</Badge></td><td className="text-right font-semibold">1.5× points</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Boosters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#262162] flex items-center gap-2">
            ⚡ Boosters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground mb-4">
            Each team gets a set of boosters to use across the season. Once activated for a match, a booster cannot be changed. Most boosters can only be used a limited number of times.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { icon: '🏏', name: 'Batting Surge', uses: '1×', desc: 'All batsmen & all-rounders in your XI earn 2× points for that match.' },
              { icon: '⚡', name: 'Bowling Surge', uses: '1×', desc: 'All bowlers & all-rounders in your XI earn 2× points for that match.' },
              { icon: '🧤', name: 'Keeping Surge', uses: '1×', desc: 'Your wicket-keeper earns 2× points for that match.' },
              { icon: '🆓', name: 'Free Hit', uses: '1×', desc: 'No budget restriction this match — pick any players. Your squad automatically reverts after.' },
              { icon: '👑', name: 'Triple Captain', uses: '2×', desc: 'Choose one player to earn 3× points instead of the usual captain 2×.' },
              { icon: '🔄', name: 'Mega Transfer', uses: '2×', desc: 'Make unlimited transfers within budget for one match with no point deductions.' },
              { icon: '⚡', name: 'Double Power', uses: '2×', desc: 'Every player in your XI earns 2× points for that match.' },
            ].map(({ icon, name, uses, desc }) => (
              <div key={name} className="flex gap-3 p-3 rounded-lg border bg-gray-50">
                <span className="text-2xl shrink-0">{icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-[#262162]">{name}</p>
                    <Badge className="bg-[#262162] text-white hover:bg-[#262162] text-xs px-1.5">{uses} per season</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Squad rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#262162] flex items-center gap-2">
            📋 Squad Selection Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700 space-y-2">
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { role: 'Wicket-Keepers', range: '1 – 4', color: 'bg-[#fefde8] text-[#262162]' },
              { role: 'Batsmen', range: '3 – 6', color: 'bg-blue-100 text-blue-700' },
              { role: 'All-Rounders', range: '1 – 4', color: 'bg-[#eeedf8] text-[#262162]' },
              { role: 'Bowlers', range: '3 – 6', color: 'bg-[#fceaea] text-[#b5211e]' },
            ].map(({ role, range, color }) => (
              <div key={role} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${color.includes('blue') ? 'border-blue-200' : 'border-gray-200'} bg-white`}>
                <span className="font-medium">{role}</span>
                <Badge className={`${color} hover:${color} text-xs font-bold`}>{range}</Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground pt-2">
            Total squad size is exactly <strong>11 players</strong>. You must stay within the budget shown on the team page.
          </p>
        </CardContent>
      </Card>

      {/* General rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#262162] flex items-center gap-2">
            📌 General Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700 space-y-2 leading-relaxed">
          <ul className="list-disc list-inside space-y-2 pl-2">
            <li>Squads must be submitted <strong>before the match starts</strong>. Late submissions will not count.</li>
            <li>Points are calculated automatically once match stats are entered by an admin.</li>
            <li>The overall leaderboard ranks teams by <strong>total cumulative points</strong> across all matches played.</li>
            <li>If a player in your XI did not bat (<em>Did Not Bat</em>), they score 0 batting points — no duck penalty applies.</li>
            <li>Booster effects are applied automatically during scoring — no manual action needed after activation.</li>
            <li>Only one booster may be activated per match per team.</li>
            <li>In the event of a tie on points, teams are ranked by the higher captain score.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
