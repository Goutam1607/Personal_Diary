import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { moodOf, type Mood } from '../lib/moods'
import type { MoodId } from '../lib/types'
import { useSettings } from './settings'

interface Ctx {
  mood: Mood
  moodId: MoodId | null
  setMood: (id: MoodId | null) => void
  /** true while the writing page is open: effects go quieter */
  writing: boolean
  setWriting: (w: boolean) => void
}

const AtmosphereContext = createContext<Ctx | null>(null)

/**
 * The mood you pick tints the whole room: sky, paper, accent colour, the weather in the window,
 * and what your companion is doing.
 */
export function AtmosphereProvider({ children }: { children: ReactNode }) {
  const [moodId, setMood] = useState<MoodId | null>(null)
  const [writing, setWriting] = useState(false)
  const { night } = useSettings()
  const mood = moodOf(moodId)

  useLayoutEffect(() => {
    const p = night ? mood.night : mood.day
    const s = document.documentElement.style
    s.setProperty('--sky1', p.sky[0])
    s.setProperty('--sky2', p.sky[1])
    s.setProperty('--sky3', p.sky[2])
    s.setProperty('--paper', p.paper)
    s.setProperty('--ink', p.ink)
    s.setProperty('--muted', p.muted)
    s.setProperty('--accent', p.accent)
    s.setProperty('--accent-soft', p.accentSoft)
    s.setProperty('--glow', p.glow)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.sky[1])
  }, [mood, night])

  useEffect(() => {
    document.documentElement.dataset.mood = moodId ?? 'none'
  }, [moodId])

  const value = useMemo(() => ({ mood, moodId, setMood, writing, setWriting }), [mood, moodId, writing])
  return <AtmosphereContext.Provider value={value}>{children}</AtmosphereContext.Provider>
}

export function useAtmosphere(): Ctx {
  const ctx = useContext(AtmosphereContext)
  if (!ctx) throw new Error('useAtmosphere outside provider')
  return ctx
}
