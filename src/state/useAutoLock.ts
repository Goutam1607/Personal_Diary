import { useEffect, useRef } from 'react'

const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
const HIDDEN_GRACE_MS = 60_000

/**
 * Locks the diary after `minutes` without any activity, and (optionally) once the
 * page has been in the background for a minute. Uses wall-clock time so it still
 * works when the browser throttles timers in background tabs or the laptop sleeps.
 */
export function useAutoLock(active: boolean, minutes: number, lockWhenHidden: boolean, lock: () => void) {
  const last = useRef(Date.now())
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    if (!active) return
    last.current = Date.now()
    const idleMs = minutes * 60_000

    const bump = () => {
      last.current = Date.now()
    }
    const check = () => {
      const now = Date.now()
      if (minutes > 0 && now - last.current >= idleMs) return lock()
      if (lockWhenHidden && hiddenAt.current !== null && now - hiddenAt.current >= HIDDEN_GRACE_MS) lock()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now()
      else {
        check()
        hiddenAt.current = null
        bump()
      }
    }

    ACTIVITY.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', check)
    const t = setInterval(check, 5_000)
    return () => {
      ACTIVITY.forEach((e) => window.removeEventListener(e, bump))
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', check)
      clearInterval(t)
    }
  }, [active, minutes, lockWhenHidden, lock])
}
