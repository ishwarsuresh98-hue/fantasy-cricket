'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    emoji:    '🏏',
    bg:       'bg-[#fef9ee]',
    ring:     'ring-[#C9A84C]/20',
    title:    'Welcome to The XI',
    body:     "The XI is fantasy cricket for your club. Pick players you know, earn points from real match performances, and compete with your clubmates for prizes.",
  },
  {
    emoji:    '⚡',
    bg:       'bg-blue-50',
    ring:     'ring-blue-200',
    title:    'Pick Your XI',
    body:     "Each gameweek, select 11 players from your club's squad. Pick a captain for 2× points and a vice-captain for 1.5× points. You can make transfers between gameweeks.",
  },
  {
    emoji:    '📊',
    bg:       'bg-green-50',
    ring:     'ring-green-200',
    title:    'Earn Points',
    body:     "Your players earn points from real performances — runs, wickets, catches, and more. The better they play, the higher you climb the leaderboard.",
  },
  {
    emoji:    '🏆',
    bg:       'bg-purple-50',
    ring:     'ring-purple-200',
    title:    'Enter Contests',
    body:     "Join free contests for fun or paid contests to win real money. Top up your wallet with a card or Apple Pay to enter paid contests.",
  },
  {
    emoji:    '💰',
    bg:       'bg-emerald-50',
    ring:     'ring-emerald-200',
    title:    'Win & Withdraw',
    body:     "Prize money goes straight to your wallet. Request a withdrawal anytime and it'll be sent to your bank account. Good luck! 🏏",
  },
] as const

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Open the modal on mount (true for new users) */
  defaultOpen: boolean
  /** Used to mark onboarding complete server-side */
  userId: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingGuide({ defaultOpen }: Props) {
  const [open,    setOpen]    = useState(defaultOpen)
  const [step,    setStep]    = useState(0)
  const [saving,  setSaving]  = useState(false)
  const router = useRouter()

  const current  = STEPS[step]
  const total    = STEPS.length
  const isFirst  = step === 0
  const isLast   = step === total - 1

  const markComplete = useCallback(async () => {
    setSaving(true)
    try {
      await fetch('/api/onboarding', { method: 'POST' })
      router.refresh()
    } finally {
      setSaving(false)
    }
  }, [router])

  function handleOpen() {
    setStep(0)
    setOpen(true)
  }

  async function handleClose() {
    setOpen(false)
    await markComplete()
  }

  function handleNext() {
    if (isLast) { handleClose(); return }
    setStep((s) => s + 1)
  }

  function handleBack() {
    setStep((s) => Math.max(0, s - 1))
  }

  return (
    <>
      {/* ── Modal overlay ───────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          aria-modal="true"
          role="dialog"
          aria-labelledby="onboarding-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Card */}
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">

            {/* Gold progress bar at top */}
            <div className="h-1 w-full bg-gray-100">
              <div
                className="h-full bg-gradient-to-r from-[#C9A84C] to-[#f5d97a] transition-all duration-500"
                style={{ width: `${((step + 1) / total) * 100}%` }}
              />
            </div>

            {/* Step dots */}
            <div className="flex items-center justify-center gap-2 pt-5 px-6">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className={cn(
                    'rounded-full transition-all duration-300 focus:outline-none',
                    i === step
                      ? 'bg-[#C9A84C] w-6 h-2'
                      : i < step
                      ? 'bg-[#C9A84C]/40 w-2 h-2'
                      : 'bg-gray-200 w-2 h-2',
                  )}
                />
              ))}
              <span className="ml-2 text-xs text-gray-400 tabular-nums">{step + 1}/{total}</span>
            </div>

            {/* Content */}
            <div className="px-8 pt-6 pb-2">
              {/* Illustration circle */}
              <div className={cn(
                'mx-auto mb-5 flex items-center justify-center w-24 h-24 rounded-full ring-8',
                current.bg, current.ring,
              )}>
                <span className="text-5xl select-none">{current.emoji}</span>
              </div>

              <h2
                id="onboarding-title"
                className="text-xl font-black text-gray-900 text-center leading-tight mb-3"
              >
                {current.title}
              </h2>
              <p className="text-sm text-gray-500 text-center leading-relaxed min-h-[72px]">
                {current.body}
              </p>
            </div>

            {/* Navigation */}
            <div className="px-8 pb-6 pt-4 space-y-3">
              <div className="flex gap-2.5">
                {!isFirst && (
                  <button
                    onClick={handleBack}
                    className="px-4 py-2.5 rounded-2xl text-gray-400 font-semibold text-sm hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
                  >
                    ← Back
                  </button>
                )}
                <button
                  onClick={handleNext}
                  disabled={saving}
                  className="flex-1 py-3 rounded-2xl bg-[#C9A84C] text-black font-black text-sm hover:bg-[#a8892e] active:scale-95 transition-all disabled:opacity-60 shadow-md shadow-[#C9A84C]/20"
                >
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                      Saving…
                    </span>
                  ) : isLast ? (
                    "Let's play! 🏏"
                  ) : (
                    'Next →'
                  )}
                </button>
              </div>

              {/* Skip */}
              <button
                onClick={handleClose}
                disabled={saving}
                className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors py-1 disabled:opacity-60"
              >
                Skip guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating help button — always visible ────────────────────────────── */}
      <button
        onClick={handleOpen}
        aria-label="Open help guide"
        className={cn(
          'fixed bottom-24 right-4 z-40 sm:bottom-6',
          'w-11 h-11 rounded-full',
          'bg-[#C9A84C] text-black',
          'flex items-center justify-center',
          'shadow-lg shadow-[#C9A84C]/30',
          'font-black text-lg leading-none',
          'hover:bg-[#a8892e] active:scale-95 transition-all',
          'ring-4 ring-white',
        )}
      >
        ?
      </button>
    </>
  )
}
