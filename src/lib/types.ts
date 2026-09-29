export type MoodId =
  | 'happy'
  | 'peaceful'
  | 'loved'
  | 'excited'
  | 'okay'
  | 'emotional'
  | 'sad'
  | 'stressed'
  | 'angry'
  | 'tired'
  | 'overwhelmed'
  | 'lonely'
  | 'unsure'

export type EntryKind = 'entry' | 'vent' | 'checkin'

export interface CheckIn {
  /** 1–5 stars, how today felt */
  day?: number
  /** 1–5, energy battery */
  energy?: number
  onMind?: string
}

export interface Entry {
  id: string
  kind: EntryKind
  /** Local calendar day this entry belongs to, YYYY-MM-DD */
  date: string
  createdAt: string
  updatedAt: string
  mood: MoodId | null
  /** Free-text mood, used when mood is null or to describe it in your own words */
  customMood?: string
  tags: string[]
  body: string
  unsaid?: string
  goodThing?: string
  prompt?: string
  favorite: boolean
  checkin?: CheckIn
}

export type CompanionKind = 'bunny' | 'bear' | 'cat' | 'penguin' | 'moon' | 'cloud'

/** Settings that are needed before unlocking (look & feel only — nothing personal). Stored in plain localStorage. */
export interface DeviceSettings {
  theme: 'auto' | 'day' | 'night'
  reduceMotion: 'system' | 'on' | 'off'
  largeText: boolean
  companion: CompanionKind
  autoLockMinutes: number
  lockWhenHidden: boolean
}

/** Personal settings, stored encrypted inside the vault. */
export interface PrivateSettings {
  name: string
  customTags: string[]
  today?: { date: string; mood: MoodId | null; customMood?: string }
}
