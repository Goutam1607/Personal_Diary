import { dayKey } from './dates'
import type { Entry, EntryKind, MoodId } from './types'

export function newEntry(kind: EntryKind, mood: MoodId | null = null, customMood?: string, date = dayKey()): Entry {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    kind,
    date,
    createdAt: now,
    updatedAt: now,
    mood,
    customMood,
    tags: [],
    body: '',
    favorite: false,
  }
}

export function hasContent(e: Entry): boolean {
  return !!(e.body.trim() || e.unsaid?.trim() || e.goodThing?.trim() || e.checkin?.onMind?.trim() || e.checkin?.day || e.checkin?.energy)
}

export function kindLabel(kind: EntryKind): string {
  return kind === 'vent' ? 'Vent' : kind === 'checkin' ? 'Check-in' : 'Little story'
}
