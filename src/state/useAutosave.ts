import { useCallback, useEffect, useRef, useState } from 'react'
import { hasContent } from '../lib/entries'
import type { Entry } from '../lib/types'
import { useVault } from './vault'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Saves (encrypted) a moment after you stop typing, when you leave the page,
 * and right before the diary locks — so auto-lock never eats your words.
 * A brand-new empty page is never saved.
 */
export function useAutosave(entry: Entry, alreadySaved: boolean) {
  const { save, onBeforeLock } = useVault()
  const latest = useRef(entry)
  latest.current = entry
  const dirty = useRef(false)
  const saved = useRef(alreadySaved)
  const initial = useRef(entry)
  const [status, setStatus] = useState<SaveStatus>(alreadySaved ? 'saved' : 'idle')
  /** Saved, but only on this device for now: it goes to your account as soon as the server can be reached. */
  const [queued, setQueued] = useState(false)

  const flush = useCallback(async () => {
    if (!dirty.current) return
    const e = latest.current
    dirty.current = false
    if (!saved.current && !hasContent(e)) return
    setStatus('saving')
    try {
      const where = await save({ ...e, updatedAt: new Date().toISOString() })
      saved.current = true
      setQueued(where === 'queued')
      setStatus('saved')
    } catch {
      dirty.current = true
      setStatus('error')
    }
  }, [save])

  useEffect(() => {
    if (entry === initial.current) return
    dirty.current = true
    const t = setTimeout(flush, 700)
    return () => clearTimeout(t)
  }, [entry, flush])

  useEffect(() => onBeforeLock(flush), [onBeforeLock, flush])

  // Switching apps on a phone or closing the tab shouldn't lose the last few words.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    const onPageHide = () => void flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [flush])
  useEffect(
    () => () => {
      void flush()
    },
    [flush],
  )

  /** Stop saving (used right before deleting, so a pending save can't bring the page back). */
  const discard = useCallback(() => {
    dirty.current = false
    saved.current = false
    latest.current = { ...latest.current, body: '', unsaid: '', goodThing: '', checkin: undefined }
  }, [])

  return { status, queued, flush, discard, isSaved: () => saved.current }
}
