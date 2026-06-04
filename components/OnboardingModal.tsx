'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Step {
  emoji: string
  title: string
  body: string
  cta?: { label: string; href: string }
}

interface Props {
  clubName: string
  slug: string
  displayName?: string | null
}

export default function OnboardingModal({ clubName, slug, displayName }: Props) {
  const [step,    setStep]    = useState(0)
  const [visible, setVisible] = useState(true)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const base  = `/clubs/${slug}`
  const steps: Step[] = [
    {
      emoji: '🏏',
      title: `Welcome${displayName ? `, ${displayName}` : ''}!`,
      body:  `The XI is fantasy cricket for ${clubName}. Pick 11 players from the club's squad each week, earn points from their real performances, and compete against your teammates for glory — and prizes.`,
    },
    {
      emoji: '👥',
      title: 'Your League',
      body:  `You're playing in the ${clubName} fantasy league. Every member of the club competes in the same league — pick the best XI each gameweek and climb the leaderboard.`,
      cta:   { label: 'View Leaderboard', href: `${base}/teams` },
    },
    {
      emoji: '⚡',
      title: 'Build Your Team',
      body:  `Pick 11 players from the squad within your £100 budget. Choose a Captain (2× points) and Vice-Captain (1.5×). You can make transfers between gameweeks — no penalty for your first change each week.`,
      cta:   { label: 'Pick My XI →', href: `${base}/team` },
    },
    {
      emoji: '💳',
      title: 'Add Funds',
      body:  `Top up your wallet to enter paid contests with real prize pools. Wallet top-ups are instant by card. You can also enter free contests with no deposit required.`,
      cta:   { label: 'Top Up Wallet', href: `${base}/wallet` },
    },
    {
      emoji: '🏆',
      title: 'Enter a Contest',
      body:  `Join a free or paid contest for the current gameweek. Free contests are open to everyone. Paid contests have prize pools — the higher the entry, the bigger the reward.`,
      cta:   { label: 'Browse Contests →', href: `${base}/contests` },
    },
  ]

  const current    = steps[step]
  const isFirst    = step === 0
  const isLast     = step === steps.length - 1

  async function markComplete() {
    setLoading(true)
    try {
      await fetch('/api/onboarding', { method: 'POST' })
    } finally {
      setLoading(false)
    }
  }

  async function handleSkip() {
    await markComplete()
    setVisible(false)
    router.refresh()
  }

  async function handleFinish() {
    await markComplete()
    setVisible(false)
    router.refresh()
    if (current.cta) router.push(current.cta.href)
  }

  function handleNext() {
    if (isLast) { handleFinish(); return }
    setStep((s) => s + 1)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">

        {/* Gold top bar */}
        <div className="h-1.5 bg-gradient-to-r from-[#C9A84C] via-[#f5d97a] to-[#C9A84C]" />

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 pt-5 px-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === step
                  ? 'bg-[#C9A84C] w-6'
                  : i < step
                  ? 'bg-[#C9A84C]/40 w-3'
                  : 'bg-gray-200 w-3',
              )}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-8 pt-6 pb-8 space-y-5">
          <div className="text-center space-y-3">
            <span className="text-6xl block">{current.emoji}</span>
            <h2 className="text-2xl font-black text-gray-900 leading-tight">{current.title}</h2>
            <p className="text-sm text-gray-500 leading-relaxed">{current.body}</p>
          </div>

          {/* CTA link */}
          {current.cta && !isLast && (
            <a
              href={current.cta.href}
              onClick={() => markComplete()}
              className="block w-full text-center py-3 rounded-2xl border-2 border-[#C9A84C] text-[#C9A84C] font-bold text-sm hover:bg-[#fef9ee] transition-colors"
            >
              {current.cta.label}
            </a>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-3 pt-1">
            {!isFirst && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="flex-shrink-0 px-4 py-2.5 rounded-xl text-gray-400 font-semibold text-sm hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                ← Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={loading}
              className="flex-1 py-3 rounded-2xl bg-[#C9A84C] text-black font-black text-sm hover:bg-[#a8892e] transition-colors disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  Saving…
                </span>
              ) : isLast ? (
                current.cta ? current.cta.label : "Let's go! 🚀"
              ) : (
                'Next →'
              )}
            </button>
          </div>

          {/* Skip */}
          <button
            onClick={handleSkip}
            disabled={loading}
            className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
          >
            Skip onboarding
          </button>
        </div>
      </div>
    </div>
  )
}
