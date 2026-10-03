import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { IndexedDbStorage } from './storage'
import {
  WrongSecretError,
  changePhrase,
  createVault,
  exportBackup,
  importBackup,
  openBackup,
  loadEntries,
  loadPrivateSettings,
  saveEntry,
  savePrivateSettings,
  unlockWithPhrase,
  deleteEntry,
} from './vault'
import type { Entry } from './types'

let n = 0
const fresh = () => new IndexedDbStorage(`test-${n++}`)

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: crypto.randomUUID(),
  kind: 'entry',
  date: '2026-09-29',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  mood: 'sad',
  tags: ['Lonely'],
  body: 'today was heavy',
  favorite: false,
  ...over,
})

describe('vault', () => {
  it('encrypts entries at rest and reads them back with the phrase', async () => {
    const s = fresh()
    const key = await createVault(s, 'soft blanket nights')
    await saveEntry(s, key, entry({ body: 'a very secret sentence' }))

    const raw = JSON.stringify(await s.exportAll())
    expect(raw).not.toContain('secret sentence')
    expect(raw).not.toContain('Lonely')

    const again = await unlockWithPhrase(s, 'soft blanket nights')
    const entries = await loadEntries(s, again)
    expect(entries).toHaveLength(1)
    expect(entries[0].body).toBe('a very secret sentence')
  })

  it('rejects a wrong phrase', async () => {
    const s = fresh()
    await createVault(s, 'soft blanket nights')
    await expect(unlockWithPhrase(s, 'wrong phrase!!')).rejects.toBeInstanceOf(WrongSecretError)
  })

  it('refuses short phrases', async () => {
    await expect(createVault(fresh(), 'short')).rejects.toThrow()
  })

  it('keeps the unlocked key non-extractable', async () => {
    const s = fresh()
    const key = await createVault(s, 'soft blanket nights')
    expect(key.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
  })

  it('binds each record to its id so records cannot be swapped', async () => {
    const s = fresh()
    const key = await createVault(s, 'soft blanket nights')
    const a = entry()
    await saveEntry(s, key, a)
    const [rec] = await s.listRecords()
    await s.putRecord({ id: 'other-id', sealed: rec.sealed })
    await expect(loadEntries(s, key)).rejects.toThrow()
  })

  it('updates, deletes and stores private settings', async () => {
    const s = fresh()
    const key = await createVault(s, 'soft blanket nights')
    const e = entry()
    await saveEntry(s, key, e)
    await saveEntry(s, key, { ...e, body: 'edited', favorite: true })
    let all = await loadEntries(s, key)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ body: 'edited', favorite: true })
    await deleteEntry(s, e.id)
    all = await loadEntries(s, key)
    expect(all).toHaveLength(0)

    await savePrivateSettings(s, key, { name: 'Moon', customTags: ['Homesick'] })
    expect(await loadPrivateSettings(s, key)).toMatchObject({ name: 'Moon', customTags: ['Homesick'] })
  })

  it('changes the phrase without losing entries', async () => {
    const s = fresh()
    const key = await createVault(s, 'soft blanket nights')
    await saveEntry(s, key, entry())
    await changePhrase(s, 'soft blanket nights', 'rainy window tea')
    await expect(unlockWithPhrase(s, 'soft blanket nights')).rejects.toThrow()
    const k2 = await unlockWithPhrase(s, 'rainy window tea')
    expect(await loadEntries(s, k2)).toHaveLength(1)
  })

  it('exports an encrypted backup and restores it elsewhere', async () => {
    const a = fresh()
    const key = await createVault(a, 'soft blanket nights')
    await saveEntry(a, key, entry({ body: 'remember this' }))
    const backup = await exportBackup(a)
    expect(JSON.stringify(backup)).not.toContain('remember this')

    const b = fresh()
    await createVault(b, 'another phrase here')
    await expect(importBackup(b, backup, 'nope nope nope')).rejects.toBeInstanceOf(WrongSecretError)
    await importBackup(b, backup, 'soft blanket nights')
    const kb = await unlockWithPhrase(b, 'soft blanket nights')
    const entries = await loadEntries(b, kb)
    expect(entries[0].body).toBe('remember this')
  })

  it('reads a backup without touching the diary on this device', async () => {
    const a = fresh()
    const key = await createVault(a, 'soft blanket nights')
    await saveEntry(a, key, entry({ body: 'lake day' }))
    await savePrivateSettings(a, key, { name: 'Sam', customTags: [] })
    const backup = await exportBackup(a)

    const b = fresh()
    const kb = await createVault(b, 'another phrase here')
    await saveEntry(b, kb, entry({ body: 'mine stays' }))
    await expect(openBackup(backup, 'nope nope nope')).rejects.toBeInstanceOf(WrongSecretError)
    const opened = await openBackup(backup, 'soft blanket nights')
    expect(opened.entries.map((e) => e.body)).toEqual(['lake day'])
    expect(opened.settings.name).toBe('Sam')
    expect((await loadEntries(b, kb)).map((e) => e.body)).toEqual(['mine stays'])
  })
})
