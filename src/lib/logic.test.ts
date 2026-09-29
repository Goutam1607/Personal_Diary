import { describe, expect, it } from 'vitest'
import { pickPrompt, ALL_PROMPTS } from './prompts'
import { journey, onThisDay, searchEntries } from './stats'
import type { Entry } from './types'

const e = (over: Partial<Entry>): Entry => ({
  id: Math.random().toString(36),
  kind: 'entry',
  date: '2026-09-29',
  createdAt: '2026-09-29T21:00:00',
  updatedAt: '2026-09-29T21:00:00',
  mood: null,
  tags: [],
  body: '',
  favorite: false,
  ...over,
})

describe('prompts', () => {
  it('never asks for the bright side on a sad day', () => {
    const bright = new Set(ALL_PROMPTS.filter((p) => p.bright).map((p) => p.text))
    for (let i = 0; i < 500; i++) expect(bright.has(pickPrompt('sad'))).toBe(false)
  })
  it('does not repeat the prompt it was asked to skip', () => {
    const first = pickPrompt(null)
    for (let i = 0; i < 100; i++) expect(pickPrompt(null, first)).not.toBe(first)
  })
})

describe('stats', () => {
  const entries = [
    e({ date: '2026-09-29', mood: 'sad', body: 'one two three' }),
    e({ date: '2026-09-28', mood: 'sad' }),
    e({ date: '2025-09-29', mood: 'happy', body: 'last year' }),
    e({ date: '2024-09-29', mood: 'peaceful', tags: ['🙏 Grateful'] }),
  ]
  it('summarises gently', () => {
    const j = journey(entries, new Date(2026, 8, 30))
    expect(j.daysThisMonth).toBe(2)
    expect(j.topMoods[0]).toEqual({ mood: 'sad', count: 2 })
    expect(j.words).toBe(5)
    expect(j.daysSinceLast).toBe(1)
  })
  it('finds entries from this day in past years', () => {
    expect(onThisDay(entries, '2026-09-29').map((x) => x.date)).toEqual(['2025-09-29', '2024-09-29'])
  })
  it('searches text and tags', () => {
    expect(searchEntries(entries, 'LAST year')).toHaveLength(1)
    expect(searchEntries(entries, 'grateful')).toHaveLength(1)
  })
})
