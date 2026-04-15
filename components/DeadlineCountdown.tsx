'use client'

import { useState, useEffect } from 'react'

interface Props {
  /** ISO string of the deadline */
  deadline: string
  /** Extra classes on the outer wrapper */
  className?: string
}

function getTimeLeft(deadline: string) {
  const diff = new Date(deadline).getTime() - Date.now()
  if (diff <= 0) return { passed: true, hours: 0, minutes: 0, seconds: 0 }
  const hours   = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)
  return { passed: false, hours, minutes, seconds }
}

export default function DeadlineCountdown({ deadline, className = '' }: Props) {
  const [tl, setTl] = useState(() => getTimeLeft(deadline))

  useEffect(() => {
    const id = setInterval(() => setTl(getTimeLeft(deadline)), 1000)
    return () => clearInterval(id)
  }, [deadline])

  if (tl.passed) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 ${className}`}>
        <span className="text-lg">🔒</span>
        <div>
          <p className="text-sm font-bold text-red-700">Deadline passed for this gameweek</p>
          <p className="text-xs text-red-600">Team selection and boosters are locked.</p>
        </div>
      </div>
    )
  }

  const urgent = tl.hours === 0 && tl.minutes < 30

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
        urgent
          ? 'border-orange-200 bg-orange-50'
          : 'border-[#262162]/20 bg-[#eeedf8]'
      } ${className}`}
    >
      <span className="text-lg">{urgent ? '⚠️' : '⏰'}</span>
      <div className="flex-1">
        <p className={`text-xs font-medium ${urgent ? 'text-orange-700' : 'text-[#262162]'}`}>
          Deadline to lock in your team
        </p>
        <p className={`text-lg font-bold tabular-nums ${urgent ? 'text-orange-700' : 'text-[#262162]'}`}>
          {tl.hours > 0 && `${tl.hours}h `}
          {String(tl.minutes).padStart(2, '0')}m{' '}
          {String(tl.seconds).padStart(2, '0')}s
        </p>
      </div>
      {urgent && (
        <span className="text-xs font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
          Closing soon
        </span>
      )}
    </div>
  )
}
