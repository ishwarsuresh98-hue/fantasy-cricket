'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

/**
 * Silently strips all query params from the current URL after mount,
 * using history.replaceState so the page doesn't re-render.
 * Used after server-side processing to prevent stale params persisting
 * on refresh or when sharing the URL.
 */
export default function CleanUrl() {
  const pathname = usePathname()

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, '', pathname)
    }
  }, [pathname])

  return null
}
