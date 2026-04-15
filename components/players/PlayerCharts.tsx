'use client'

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'

interface PointsData {
  match: number
  points: number
}

interface StatsData {
  match: number
  runs: number
  wickets: number
  catches: number
}

interface CreditData {
  match: number
  credit: number
}

interface Props {
  pointsData: PointsData[]
  statsData: StatsData[]
  creditData: CreditData[]
  avgPoints: number
}

export default function PlayerCharts({ pointsData, statsData, creditData, avgPoints }: Props) {
  return (
    <div className="space-y-8">
      {/* Points per match */}
      {pointsData.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#262162] mb-3">Points per Match</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={pointsData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="match"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `M${v}`}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: unknown) => [`${v} pts`, 'Points']}
                labelFormatter={(l) => `Match ${l}`}
              />
              <ReferenceLine
                y={avgPoints}
                stroke="#fbf927"
                strokeDasharray="4 4"
                label={{ value: 'Avg', position: 'right', fontSize: 10, fill: '#888' }}
              />
              <Line
                type="monotone"
                dataKey="points"
                stroke="#262162"
                strokeWidth={2}
                dot={{ r: 3, fill: '#262162' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Runs / Wickets / Catches bar chart */}
      {statsData.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#262162] mb-3">Match Stats</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={statsData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="match"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `M${v}`}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={(l) => `Match ${l}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="runs" name="Runs" fill="#262162" radius={[2, 2, 0, 0]} />
              <Bar dataKey="wickets" name="Wickets" fill="#b5211e" radius={[2, 2, 0, 0]} />
              <Bar dataKey="catches" name="Catches" fill="#fbf927" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Credit history */}
      {creditData.length > 1 && (
        <div>
          <h3 className="text-sm font-semibold text-[#262162] mb-3">Credit History</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={creditData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="match"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `M${v}`}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                domain={[5.5, 11.5]}
                ticks={[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11]}
              />
              <Tooltip
                formatter={(v: unknown) => [`${v}`, 'Credits']}
                labelFormatter={(l) => `After Match ${l}`}
              />
              <Line
                type="monotone"
                dataKey="credit"
                stroke="#16a34a"
                strokeWidth={2}
                dot={{ r: 3, fill: '#16a34a' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
