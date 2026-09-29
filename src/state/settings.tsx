import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isNightTime } from '../lib/dates'
import type { DeviceSettings } from '../lib/types'

const KEY = 'little-corner:device-settings'

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  theme: 'auto',
  reduceMotion: 'system',
  largeText: false,
  companion: 'bunny',
  autoLockMinutes: 5,
  lockWhenHidden: true,
}

function load(): DeviceSettings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_DEVICE_SETTINGS, ...JSON.parse(raw) } : DEFAULT_DEVICE_SETTINGS
  } catch {
    return DEFAULT_DEVICE_SETTINGS
  }
}

interface Ctx {
  settings: DeviceSettings
  update: (patch: Partial<DeviceSettings>) => void
  night: boolean
  motion: boolean
}

const SettingsContext = createContext<Ctx | null>(null)

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

/** Re-renders every few minutes so "auto" night mode follows the clock. */
function useClockTick(ms = 5 * 60_000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DeviceSettings>(load)
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)')
  const systemReduce = useMediaQuery('(prefers-reduced-motion: reduce)')
  useClockTick()

  const update = useCallback((patch: Partial<DeviceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* storage may be unavailable (private mode); settings then last for this visit */
      }
      return next
    })
  }, [])

  const night = settings.theme === 'night' || (settings.theme === 'auto' && (systemDark || isNightTime()))
  const motion = settings.reduceMotion === 'off' || (settings.reduceMotion === 'system' && !systemReduce)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('night', night)
    root.classList.toggle('no-motion', !motion)
    root.classList.toggle('large-text', settings.largeText)
  }, [night, motion, settings.largeText])

  const value = useMemo(() => ({ settings, update, night, motion }), [settings, update, night, motion])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings outside provider')
  return ctx
}
