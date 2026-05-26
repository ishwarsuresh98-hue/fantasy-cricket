'use client'

/**
 * Hook that manages the Web Push subscription lifecycle:
 *   - Checks current Notification.permission
 *   - Provides subscribe() / unsubscribe()
 *   - Persists the subscription to /api/push/subscribe
 */
import { useState, useEffect, useCallback } from 'react'

export type PushState = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | 'loading'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  const buffer  = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i)
  return buffer.buffer
}

export function usePushSubscription() {
  const [state, setState] = useState<PushState>('loading')

  // Derive current state from browser APIs
  const refreshState = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    setState(existing ? 'subscribed' : 'unsubscribed')
  }, [])

  useEffect(() => { refreshState() }, [refreshState])

  const subscribe = useCallback(async (): Promise<boolean> => {
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setState('denied')
        return false
      }

      const reg         = await navigator.serviceWorker.ready
      const vapidKey    = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const json   = subscription.toJSON()
      const p256dh = json.keys?.p256dh
      const auth   = json.keys?.auth

      if (!p256dh || !auth) throw new Error('Missing push subscription keys')

      const res = await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ endpoint: subscription.endpoint, keys: { p256dh, auth } }),
      })

      if (!res.ok) throw new Error(`Server responded ${res.status}`)

      setState('subscribed')
      return true
    } catch (err) {
      console.error('[push] subscribe error:', err)
      await refreshState()
      return false
    }
  }, [refreshState])

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    try {
      const reg      = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (!existing) { setState('unsubscribed'); return true }

      await fetch('/api/push/subscribe', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ endpoint: existing.endpoint }),
      })

      await existing.unsubscribe()
      setState('unsubscribed')
      return true
    } catch (err) {
      console.error('[push] unsubscribe error:', err)
      return false
    }
  }, [])

  return { state, subscribe, unsubscribe }
}
