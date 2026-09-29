import { dayKey, parseDay } from './dates'
import type { Entry, MoodId } from './types'

export interface Journey {
  totalEntries: number
  daysWritten: number
  daysThisMonth: number
  entriesThisMonth: number
  words: number
  topMoods: { mood: MoodId; count: number }[]
  weekdays: number[]
  /** 0 = morning, 1 = afternoon, 2 = evening, 3 = late night */
  timesOfDay: number[]
  daysSinceLast: number | null
  firstDay: string | null
}

export function journey(entries: Entry[], now = new Date()): Journey {
  const days = new Set(entries.map((e) => e.date))
  const monthPrefix = dayKey(now).slice(0, 7)
  const thisMonth = entries.filter((e) => e.date.startsWith(monthPrefix))
  const moodCounts = new Map<MoodId, number>()
  const weekdays = [0, 0, 0, 0, 0, 0, 0]
  const timesOfDay = [0, 0, 0, 0]
  let words = 0
  for (const e of entries) {
    if (e.mood) moodCounts.set(e.mood, (moodCounts.get(e.mood) ?? 0) + 1)
    weekdays[parseDay(e.date).getDay()]++
    const h = new Date(e.createdAt).getHours()
    timesOfDay[h >= 5 && h < 12 ? 0 : h >= 12 && h < 17 ? 1 : h >= 17 && h < 22 ? 2 : 3]++
    for (const text of [e.body, e.unsaid, e.goodThing, e.checkin?.onMind]) {
      if (text) words += text.trim().split(/\s+/).filter(Boolean).length
    }
  }
  const sortedDays = [...days].sort()
  const last = sortedDays.at(-1)
  const daysSinceLast = last
    ? Math.round((parseDay(dayKey(now)).getTime() - parseDay(last).getTime()) / 86_400_000)
    : null
  return {
    totalEntries: entries.length,
    daysWritten: days.size,
    daysThisMonth: new Set(thisMonth.map((e) => e.date)).size,
    entriesThisMonth: thisMonth.length,
    words,
    topMoods: [...moodCounts.entries()]
      .map(([mood, count]) => ({ mood, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    weekdays,
    timesOfDay,
    daysSinceLast,
    firstDay: sortedDays[0] ?? null,
  }
}

/** Entries written on this month/day in earlier years, newest first. */
export function onThisDay(entries: Entry[], today = dayKey()): Entry[] {
  const md = today.slice(5)
  const year = today.slice(0, 4)
  return entries
    .filter((e) => e.date.slice(5) === md && e.date.slice(0, 4) < year && e.kind !== 'checkin')
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function searchEntries(entries: Entry[], query: string): Entry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  const terms = q.split(/\s+/)
  return entries.filter((e) => {
    const hay = [e.body, e.unsaid, e.goodThing, e.customMood, e.mood, e.prompt, e.checkin?.onMind, ...e.tags]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

export function excerpt(e: Entry, length = 160): string {
  const text = (e.body || e.checkin?.onMind || e.goodThing || '').replace(/\s+/g, ' ').trim()
  return text.length > length ? text.slice(0, length).replace(/\s\S*$/, '') + '…' : text
}
