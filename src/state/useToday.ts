import { useCallback } from 'react'
import { dayKey } from '../lib/dates'
import type { MoodId } from '../lib/types'
import { useVault } from './vault'

/** Today's chosen mood (kept encrypted with your other private settings). */
export function useToday() {
  const { privateSettings, updatePrivate } = useVault()
  const today = privateSettings.today?.date === dayKey() ? privateSettings.today : undefined

  const setTodayMood = useCallback(
    (mood: MoodId | null, customMood?: string) => updatePrivate({ today: { date: dayKey(), mood, customMood } }),
    [updatePrivate],
  )

  return { mood: today?.mood ?? null, customMood: today?.customMood, setTodayMood }
}
