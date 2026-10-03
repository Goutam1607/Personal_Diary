import 'fake-indexeddb/auto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiClient } from '../src/lib/api.ts'
import { signIn, signUp } from '../src/lib/account.ts'
import { findLegacyDiary, mergeIntoAccount, moveIntoEmptyAccount, movedInto, removeDeviceCopy } from '../src/lib/migrate.ts'
import { Outbox, RemoteStorage } from '../src/lib/remoteStorage.ts'
import { IndexedDbStorage } from '../src/lib/storage.ts'
import type { Entry } from '../src/lib/types.ts'
import {
  changePhrase,
  createVault,
  deleteEntry,
  exportBackup,
  importBackup,
  loadEntries,
  loadPrivateSettings,
  saveEntry,
  savePrivateSettings,
  unlockWithPhrase,
} from '../src/lib/vault.ts'
import { createApp } from './app.ts'
import { migrate, pgliteDb, type Db } from './db.ts'

// The browser-only bits these flows touch.
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage

let db: Db
let server: Server
let base: string
let up = true // flip to simulate the server being unreachable

beforeAll(async () => {
  db = await pgliteDb()
  await migrate(db)
  const api = createApp({ db, secureCookies: false, signupsPerHour: 1000 })
  server = createServer((req, res) => void api(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}, 60_000)

afterAll(async () => {
  server.close()
  await db.close()
})

let n = 0
/** One "browser": its own cookie jar, outbox and device storage. */
async function browser(account = `friend${n++}`) {
  let cookie = ''
  const f: typeof fetch = async (input, init) => {
    if (!up) throw new TypeError('Failed to fetch')
    const res = await fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), ...(cookie ? { Cookie: cookie } : {}) } })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return res
  }
  const client = new ApiClient({ base, fetch: f })
  const remote = new RemoteStorage(client, new Outbox(`outbox-${n}-${Math.random()}`))
  const legacy = new IndexedDbStorage(`legacy-${n}-${Math.random()}`)
  return { client, remote, legacy, account, register: async () => ((remote.account = (await signUp(client, account, 'account password')).username)) }
}

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: crypto.randomUUID(),
  kind: 'entry',
  date: '2026-09-29',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  mood: 'peaceful',
  tags: ['Grateful'],
  body: 'a quiet evening',
  favorite: false,
  ...over,
})

describe('the diary on the server', () => {
  it('stores only ciphertext and reads it back on another device', async () => {
    const laptop = await browser()
    await laptop.register()
    const key = await createVault(laptop.remote, 'soft blanket nights')
    await saveEntry(laptop.remote, key, entry({ body: 'a very secret sentence' }))
    await savePrivateSettings(laptop.remote, key, { name: 'Moon', customTags: ['Homesick'] })

    const { rows } = await db.query('SELECT * FROM vault_items')
    const everything = JSON.stringify(rows) + JSON.stringify((await db.query('SELECT * FROM vaults')).rows)
    expect(everything).not.toContain('secret sentence')
    expect(everything).not.toContain('Homesick')
    expect(everything).not.toContain('soft blanket')

    const phone = await browser(laptop.account)
    await signIn(phone.client, laptop.account, 'account password')
    phone.remote.account = laptop.account
    const k2 = await unlockWithPhrase(phone.remote, 'soft blanket nights')
    expect((await loadEntries(phone.remote, k2)).map((e) => e.body)).toEqual(['a very secret sentence'])
    expect((await loadPrivateSettings(phone.remote, k2)).name).toBe('Moon')
  })

  it('edits, deletes, changes the phrase, and backs up / restores through the server', async () => {
    const b = await browser()
    await b.register()
    const key = await createVault(b.remote, 'soft blanket nights')
    const e = entry()
    await saveEntry(b.remote, key, e)
    await saveEntry(b.remote, key, { ...e, body: 'edited' })
    const gone = entry({ body: 'let it go' })
    await saveEntry(b.remote, key, gone)
    await deleteEntry(b.remote, gone.id)
    expect((await loadEntries(b.remote, key)).map((x) => x.body)).toEqual(['edited'])

    await changePhrase(b.remote, 'soft blanket nights', 'rainy window tea')
    await expect(unlockWithPhrase(b.remote, 'soft blanket nights')).rejects.toThrow()
    const k2 = await unlockWithPhrase(b.remote, 'rainy window tea')

    const backup = await exportBackup(b.remote)
    expect(JSON.stringify(backup)).not.toContain('edited')
    await saveEntry(b.remote, k2, entry({ body: 'after the backup' }))
    await importBackup(b.remote, backup, 'rainy window tea')
    expect((await loadEntries(b.remote, await unlockWithPhrase(b.remote, 'rainy window tea'))).map((x) => x.body)).toEqual(['edited'])
  })

  it('keeps saves in the outbox while offline and sends them when back', async () => {
    const b = await browser()
    await b.register()
    const key = await createVault(b.remote, 'soft blanket nights')
    up = false
    const offline = entry({ body: 'written on a train' })
    try {
      await saveEntry(b.remote, key, offline) // resolves: kept safely in the outbox
      expect(await b.remote.isPending('record', offline.id)).toBe(true)
    } finally {
      up = true
    }
    expect((await db.query("SELECT 1 FROM vault_items WHERE id = $1", [offline.id])).rows).toHaveLength(0)
    expect(await b.remote.sync()).toEqual([])
    expect(await b.remote.pendingCount()).toBe(0)
    expect((await loadEntries(b.remote, key)).map((e) => e.body)).toEqual(['written on a train'])
  })

  it('rejects a stale passkey/phrase change from another device instead of overwriting it', async () => {
    const a = await browser()
    await a.register()
    await createVault(a.remote, 'soft blanket nights')
    const other = await browser(a.account)
    await signIn(other.client, a.account, 'account password')
    other.remote.account = a.account
    await other.remote.getMeta()
    await changePhrase(a.remote, 'soft blanket nights', 'rainy window tea')
    await expect(other.remote.putMeta((await a.remote.getMeta())!)).rejects.toThrow(/changed somewhere else/)
  })
})

describe('moving a diary from this browser into the account', () => {
  it('case 1: uploads it exactly as encrypted, keeping the same phrase, after checking every page opens', async () => {
    const b = await browser()
    const oldKey = await createVault(b.legacy, 'soft blanket nights')
    await saveEntry(b.legacy, oldKey, entry({ body: 'from before accounts' }))
    await saveEntry(b.legacy, oldKey, entry({ body: 'another old page' }))
    await savePrivateSettings(b.legacy, oldKey, { name: 'Moon', customTags: [] })
    await b.register()

    const legacy = (await findLegacyDiary(b.legacy))!
    expect(legacy.pages).toBe(2)
    await expect(moveIntoEmptyAccount(legacy, { phrase: 'wrong phrase!!' }, b.remote)).rejects.toThrow()
    expect((await db.query('SELECT 1 FROM vaults v JOIN users u ON u.id = v.user_id WHERE u.username = $1', [b.account])).rows).toHaveLength(0)

    const { pages } = await moveIntoEmptyAccount(legacy, { phrase: 'soft blanket nights' }, b.remote)
    expect(pages).toBe(2)
    expect(movedInto(legacy, b.account)).toBe(true)
    const key = await unlockWithPhrase(b.remote, 'soft blanket nights')
    expect((await loadEntries(b.remote, key)).map((e) => e.body).sort()).toEqual(['another old page', 'from before accounts'])
    expect((await loadPrivateSettings(b.remote, key)).name).toBe('Moon')
    // the device copy is untouched until asked
    expect(await b.legacy.listRecords()).toHaveLength(2)
    // and it can't be moved over the account's diary a second time
    await expect(moveIntoEmptyAccount(legacy, { phrase: 'soft blanket nights' }, b.remote)).rejects.toThrow(/already has a diary/)

    await removeDeviceCopy(legacy, b.remote)
    expect(await findLegacyDiary(new IndexedDbStorage((b.legacy as unknown as { name: string }).name))).toBeNull()
  })

  it('case 2: re-encrypts device pages into an existing account diary without overwriting anything', async () => {
    const b = await browser()
    await b.register()
    const accountKey = await createVault(b.remote, 'the account phrase')
    const existing = entry({ body: 'already in the account' })
    await saveEntry(b.remote, accountKey, existing)

    const oldKey = await createVault(b.legacy, 'my old device phrase')
    await saveEntry(b.legacy, oldKey, entry({ body: 'only on this device' }))
    // same id as an account page, different words: must not replace the account's version
    await saveEntry(b.legacy, oldKey, { ...existing, body: 'stale device copy' })
    await savePrivateSettings(b.legacy, oldKey, { name: '', customTags: ['Homesick'] })

    const legacy = (await findLegacyDiary(b.legacy))!
    const result = await mergeIntoAccount(legacy, { phrase: 'my old device phrase' }, b.remote, accountKey)
    expect(result).toMatchObject({ added: 1, skipped: 1 })
    expect(result.settings.customTags).toEqual(['Homesick'])
    const bodies = (await loadEntries(b.remote, accountKey)).map((e) => e.body).sort()
    expect(bodies).toEqual(['already in the account', 'only on this device'])
    // the account still opens with its own phrase, not the device's
    await expect(unlockWithPhrase(b.remote, 'my old device phrase')).rejects.toThrow()
  })

  it('refuses to remove the device copy before it has been moved', async () => {
    const b = await browser()
    await b.register()
    await createVault(b.legacy, 'soft blanket nights')
    const legacy = (await findLegacyDiary(b.legacy))!
    await expect(removeDeviceCopy(legacy, b.remote)).rejects.toThrow(/hasn’t been moved/)
    expect(await b.legacy.getMeta()).toBeDefined()
  })
})
