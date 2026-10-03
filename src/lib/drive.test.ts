import { describe, expect, it } from 'vitest'
import { backupIsDue } from './drive'

describe('backup reminder', () => {
  const now = new Date('2026-10-10T12:00:00Z').getTime()
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString()

  it('stays quiet with no pages', () => expect(backupIsDue([], null, now)).toBe(false))
  it('asks when nothing was ever backed up', () => expect(backupIsDue([daysAgo(0)], null, now)).toBe(true))
  it('asks when new pages are a few days behind', () => expect(backupIsDue([daysAgo(1)], daysAgo(4), now)).toBe(true))
  it('stays quiet when nothing changed since the backup', () => expect(backupIsDue([daysAgo(10)], daysAgo(5), now)).toBe(false))
  it('waits a few days before nudging', () => expect(backupIsDue([daysAgo(0)], daysAgo(1), now)).toBe(false))
})
