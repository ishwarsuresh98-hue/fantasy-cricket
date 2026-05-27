'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePushSubscription } from '@/lib/usePushSubscription'
import type { Notification } from '@/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const { state: pushState, subscribe } = usePushSubscription()
  const [subscribing, setSubscribing] = useState(false)

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(15)
    setNotifications(data ?? [])
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
    if (!unreadIds.length) return
    const supabase = createClient()
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (val) fetchNotifications().then(markAllRead)
  }

  async function handleEnablePush() {
    setSubscribing(true)
    await subscribe()
    setSubscribing(false)
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  // Bell icon changes based on push state
  const bellIcon =
    pushState === 'subscribed'   ? '🔔' :
    pushState === 'denied'       ? '🔕' : '🔔'

  function relativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        render={
          <button
            className="relative flex items-center justify-center w-9 h-9 rounded-md hover:bg-[#f5f5f5]/10 transition-colors"
            title={pushState === 'subscribed' ? 'Notifications on' : pushState === 'denied' ? 'Notifications blocked' : 'Notifications off'}
          />
        }
      >
        <span className="text-[#0b0b0b] text-lg">{bellIcon}</span>
        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] bg-[#b5211e] text-[#0b0b0b] text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        {/* Push-status dot when no unread: green = on, grey = off */}
        {unreadCount === 0 && pushState !== 'loading' && pushState !== 'unsupported' && (
          <span className={`absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full border border-[#C9A84C] ${
            pushState === 'subscribed' ? 'bg-green-400' :
            pushState === 'denied'    ? 'bg-gray-400'  : 'bg-gray-500'
          }`} />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 max-h-[460px] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 bg-[#f0f0f0] border-b px-4 py-3 flex items-center justify-between">
          <p className="font-semibold text-sm text-[#C9A84C]">Notifications</p>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-[#C9A84C] hover:underline">
              Mark all read
            </button>
          )}
        </div>

        {/* Push opt-in banner — only when unsubscribed */}
        {(pushState === 'unsubscribed') && (
          <div className="border-b bg-[#1c1c1c] px-4 py-3 flex items-center gap-2.5">
            <span className="text-lg">🔔</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#C9A84C]">Enable push notifications</p>
              <p className="text-[10px] text-[#C9A84C]/60">Get score alerts &amp; deadline reminders.</p>
            </div>
            <button
              onClick={handleEnablePush}
              disabled={subscribing}
              className="flex-shrink-0 text-[11px] font-bold bg-[#f0f0f0] text-[#0b0b0b] px-2.5 py-1.5 rounded-lg hover:bg-[#fafafa] disabled:opacity-50 transition-colors"
            >
              {subscribing ? '…' : 'Enable'}
            </button>
          </div>
        )}

        {/* Denied notice */}
        {pushState === 'denied' && (
          <div className="border-b bg-[#fef9ee] px-4 py-2.5 flex items-center gap-2">
            <span className="text-base">🔕</span>
            <p className="text-xs text-[#C9A84C]">Notifications blocked in browser settings.</p>
          </div>
        )}

        {/* Notifications list */}
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((n) => (
              <div key={n.id} className={`px-4 py-3 ${n.is_read ? 'bg-[#f0f0f0]' : 'bg-[#1c1c1c]'}`}>
                <div className="flex items-start gap-2">
                  <span className="text-base shrink-0 mt-0.5">
                    {n.type === 'rank_change'
                      ? (n.metadata.change as number) > 0 ? '📈' : '📉'
                      : '⭐'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium leading-snug ${n.is_read ? 'text-[#d4d4d4]' : 'text-[#C9A84C]'}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">{relativeTime(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 bg-[#f0f0f0] rounded-full mt-1.5 shrink-0" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
