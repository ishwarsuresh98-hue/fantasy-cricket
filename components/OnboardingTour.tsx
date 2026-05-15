'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

// ── Step definitions ──────────────────────────────────────────────────────────

interface Step {
  id: number
  icon: string
  title: string
  body: string
  cta?: string          // overrides the default "Next →" label
  ctaHref?: string      // if set, CTA navigates instead of advancing
}

const STEPS: Step[] = [
  {
    id: 1,
    icon: '👋',
    title: 'Welcome to Slough CC Fantasy League 2026!',
    body: 'Pick your best XI, captain your star player, and compete with your teammates all season long.',
    cta: "Let's get started",
  },
  {
    id: 2,
    icon: '✏️',
    title: 'Name your team',
    body: "Give your fantasy team a unique name — this is what everyone will see on the leaderboard. You can change it any time before the deadline.",
  },
  {
    id: 3,
    icon: '🏏',
    title: 'Pick your Player Pool',
    body: "Choose your best 11 from Slough CC players confirmed to play that day. You have a 100 credit budget — spend it wisely across all roles.",
  },
  {
    id: 4,
    icon: '👑',
    title: 'Captain & Vice Captain',
    body: 'Your Captain earns 2× points and your Vice Captain earns 1.5× points. Pick your most in-form player as skipper!',
  },
  {
    id: 5,
    icon: '💥',
    title: 'Use your Boosters',
    body: "You have 9 special boosters to use across the season — Double Power, Free Hit, Triple Captain and more. Save them for the right moment!",
  },
  {
    id: 6,
    icon: '⏱',
    title: 'Beat the Deadline',
    body: 'The gameweek locks 1 hour before the first match of the day. Always submit your team before the countdown hits zero — late changes are blocked!',
  },
  {
    id: 7,
    icon: '🎉',
    title: "You're all set!",
    body: 'Good luck this season! Head to My Team to make your first pick.',
    cta: 'Go to My Team',
    ctaHref: '/team',
  },
]

const TOTAL = STEPS.length

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Visual illustration for each step */
function StepIllustration({ step }: { step: Step }) {
  if (step.id === 1) {
    return (
      <div className="flex flex-col items-center gap-3 mb-2">
        <div className="relative w-24 h-24 rounded-full overflow-hidden bg-white shadow-lg border-4 border-[#fbf927]">
          <Image
            src="/slough-cc-crest.png"
            alt="Slough CC"
            fill
            className="object-contain p-1"
          />
        </div>
        <span className="text-5xl animate-bounce">{step.icon}</span>
      </div>
    )
  }
  if (step.id === 7) {
    return (
      <div className="flex items-center justify-center gap-2 mb-2 text-5xl">
        🎉 🏆 🎉
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center mb-2">
      <span className="text-6xl">{step.icon}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  userId: string
}

export default function OnboardingTour({ userId }: Props) {
  const router = useRouter()
  const [step, setStep]         = useState(0)   // 0-indexed
  const [visible, setVisible]   = useState(false)
  const [animDir, setAnimDir]   = useState<'enter' | 'exit-left' | 'exit-right'>('enter')
  const [exiting, setExiting]   = useState(false)

  // Mount fade-in after first paint so CSS transition fires
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape')      dismiss()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') advance()
      else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // advance/back/dismiss are stable within a render; re-subscribe when step changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const current = STEPS[step]

  async function markComplete() {
    const supabase = createClient()
    await supabase
      .from('profiles')
      .update({ onboarding_complete: true })
      .eq('id', userId)
  }

  const dismiss = useCallback(async (href?: string) => {
    setExiting(true)
    await markComplete()
    setTimeout(() => {
      if (href) router.push(href)
      else router.refresh()
    }, 350)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  function advance() {
    if (step >= TOTAL - 1) {
      dismiss(current.ctaHref)
      return
    }
    setAnimDir('exit-left')
    setTimeout(() => {
      setStep((s) => s + 1)
      setAnimDir('enter')
    }, 200)
  }

  function back() {
    if (step === 0) return
    setAnimDir('exit-right')
    setTimeout(() => {
      setStep((s) => s - 1)
      setAnimDir('enter')
    }, 200)
  }

  // ── Overlay ─────────────────────────────────────────────────────────────────
  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${
        visible && !exiting ? 'bg-black/60 backdrop-blur-sm' : 'bg-transparent'
      }`}
      aria-modal="true"
      role="dialog"
      aria-label="Onboarding walkthrough"
    >
      {/* Card */}
      <div
        className={`relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
          visible && !exiting ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        {/* Navy header bar */}
        <div className="bg-[#262162] px-6 pt-6 pb-4">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mb-5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i === step
                    ? 'w-5 h-2 bg-[#fbf927]'
                    : i < step
                    ? 'w-2 h-2 bg-[#fbf927]/40'
                    : 'w-2 h-2 bg-white/20'
                }`}
              />
            ))}
          </div>

          {/* Step label */}
          <p className="text-center text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase mb-1">
            Step {step + 1} of {TOTAL}
          </p>
        </div>

        {/* Content area — animated */}
        <div
          className={`px-6 py-6 text-center transition-all duration-200 ${
            animDir === 'enter'
              ? 'opacity-100 translate-x-0'
              : animDir === 'exit-left'
              ? 'opacity-0 -translate-x-8'
              : 'opacity-0 translate-x-8'
          }`}
          style={{ minHeight: '240px' }}
        >
          <StepIllustration step={current} />

          <h2 className="text-xl font-extrabold text-[#262162] mt-3 mb-2 leading-snug">
            {current.title}
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed max-w-xs mx-auto">
            {current.body}
          </p>
        </div>

        {/* Action row */}
        <div className="px-6 pb-6 flex flex-col gap-3">
          {/* Back + CTA */}
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={back}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
            )}
            <button
              onClick={() => {
                if (current.ctaHref) { dismiss(current.ctaHref) }
                else advance()
              }}
              className="flex-1 py-2.5 rounded-xl bg-[#262162] text-white text-sm font-bold hover:bg-[#1a1748] active:scale-95 transition-all"
            >
              {current.cta ?? (step === TOTAL - 1 ? '✓ Done' : 'Next →')}
            </button>
          </div>

          {/* Skip */}
          <button
            onClick={() => dismiss()}
            className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
          >
            Skip tour
          </button>
        </div>

        {/* Keyboard hint — desktop only */}
        <p className="hidden sm:block text-center text-[10px] text-gray-300 pb-3">
          Press <kbd className="bg-gray-100 text-gray-500 rounded px-1 font-mono text-[10px]">→</kbd> to advance, <kbd className="bg-gray-100 text-gray-500 rounded px-1 font-mono text-[10px]">Esc</kbd> to skip
        </p>
      </div>
    </div>
  )
}
