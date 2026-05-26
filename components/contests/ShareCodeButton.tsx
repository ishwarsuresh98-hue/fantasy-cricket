'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export default function ShareCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all',
        copied
          ? 'bg-green-100 text-green-700 border border-green-300'
          : 'bg-[#eeedf8] text-[#262162] border border-[#262162]/20 hover:bg-[#dddcf5]',
      )}
    >
      {copied ? '✓ Copied!' : `📋 Copy Code: ${code}`}
    </button>
  )
}
