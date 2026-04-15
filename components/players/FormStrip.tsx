'use client'

interface FormEntry {
  matchNumber: number
  status: 'above' | 'below' | 'dnp'
  points?: number
}

interface Props {
  form: FormEntry[]
}

const CONFIG = {
  above: { bg: 'bg-green-500', text: 'text-white', label: 'Above avg' },
  below: { bg: 'bg-red-400',   text: 'text-white', label: 'Below avg' },
  dnp:   { bg: 'bg-gray-200',  text: 'text-gray-500', label: 'Did not play' },
}

export default function FormStrip({ form }: Props) {
  if (form.length === 0) {
    return <p className="text-sm text-muted-foreground">No recent matches.</p>
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {form.map((entry) => {
        const c = CONFIG[entry.status]
        return (
          <div key={entry.matchNumber} className="flex flex-col items-center gap-1">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold ${c.bg} ${c.text}`}
              title={`M${entry.matchNumber}: ${c.label}${entry.points !== undefined ? ` (${entry.points} pts)` : ''}`}
            >
              {entry.status === 'dnp' ? '–' : entry.points ?? '?'}
            </div>
            <span className="text-[10px] text-muted-foreground">M{entry.matchNumber}</span>
          </div>
        )
      })}
    </div>
  )
}
