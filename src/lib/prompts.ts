import type { MoodId } from './types'

type Weight = 'light' | 'reflective' | 'deep'

interface Prompt {
  text: string
  weight: Weight
  /** Prompts that ask you to find something good. Never offered on heavy days. */
  bright?: boolean
}

const PROMPTS: Prompt[] = [
  { text: 'What has been on your mind lately?', weight: 'light' },
  { text: 'What made you smile today?', weight: 'light', bright: true },
  { text: 'What happened today that you want to remember?', weight: 'light' },
  { text: 'What are you looking forward to?', weight: 'light', bright: true },
  { text: 'What did you eat today? Was any of it good?', weight: 'light' },
  { text: 'Describe the sky today, or the last time you noticed it.', weight: 'light' },
  { text: 'What song has been stuck in your head?', weight: 'light' },
  { text: 'Who did you talk to today? How did it feel?', weight: 'light' },
  { text: 'What’s one small thing you did just for you?', weight: 'light' },
  { text: 'What are you grateful for?', weight: 'reflective', bright: true },
  { text: 'What are you proud of?', weight: 'reflective', bright: true },
  { text: 'What do you need right now?', weight: 'reflective' },
  { text: 'What would you tell your younger self?', weight: 'reflective' },
  { text: 'What’s taking up the most space in your head?', weight: 'reflective' },
  { text: 'If today had a colour, what would it be?', weight: 'reflective' },
  { text: 'What would make tomorrow a little softer?', weight: 'reflective' },
  { text: 'What are you pretending doesn’t bother you?', weight: 'deep' },
  { text: 'What do you wish someone would understand?', weight: 'deep' },
  { text: 'What are you scared about?', weight: 'deep' },
  { text: 'What’s something you haven’t said out loud yet?', weight: 'deep' },
]

const HEAVY: MoodId[] = ['sad', 'lonely', 'overwhelmed', 'stressed', 'angry', 'tired', 'emotional']

/**
 * Gently random: mostly light prompts, sometimes reflective, rarely deep.
 * On heavy days, never asks you to look on the bright side, and never piles on deep questions
 * when you're already overwhelmed or tired.
 */
export function pickPrompt(mood: MoodId | null, exclude?: string, rand = Math.random): string {
  const heavy = !!mood && HEAVY.includes(mood)
  let pool = PROMPTS.filter((p) => p.text !== exclude && !(heavy && p.bright))
  if (mood === 'overwhelmed' || mood === 'tired') pool = pool.filter((p) => p.weight !== 'deep')

  const roll = rand()
  const weight: Weight = roll < 0.6 ? 'light' : roll < 0.9 ? 'reflective' : 'deep'
  const preferred = pool.filter((p) => p.weight === weight)
  const from = preferred.length ? preferred : pool
  return from[Math.floor(rand() * from.length)].text
}

export const ALL_PROMPTS = PROMPTS
