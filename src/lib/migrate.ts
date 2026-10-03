import { open, seal } from './crypto'
import type { RemoteStorage } from './remoteStorage'
import { IndexedDbStorage, type PasskeyUnlock, type StoredRecord, type VaultMeta } from './storage'
import type { Entry, PrivateSettings } from './types'
import { listPasskeys, loadEntries, loadPrivateSettings, unlockWithPasskey, unlockWithPhrase } from './vault'

/**
 * Moving a diary that lived only in this browser (IndexedDB, before accounts existed) into the
 * signed-in account. Two cases:
 *
 *  1. The account has no diary yet → the device diary is uploaded exactly as it is encrypted: same
 *     vault key, same secret phrase, same passkeys. Nothing is decrypted on its way to the server.
 *  2. The account already has a diary (e.g. started on another device) → the device diary is
 *     unlocked here with its own phrase, each page is re-encrypted with the account diary's key in
 *     this browser, and added. Pages already in the account are never overwritten.
 *
 * In both cases every page is decrypted locally first, so a wrong phrase or damaged data stops the
 * move before anything is sent; and the device copy is left untouched — it's only removed if you
 * explicitly ask for that afterwards.
 */

export interface LegacyDiary {
  storage: IndexedDbStorage
  meta: VaultMeta
  pages: number
  passkeys: PasskeyUnlock[]
}

export type LegacySecret = { phrase: string } | { passkey: PasskeyUnlock }

const MARK = 'little-corner:legacy-moved'

/** The diary kept in this browser before accounts, if there is one. */
export async function findLegacyDiary(storage = new IndexedDbStorage()): Promise<LegacyDiary | null> {
  try {
    if (typeof indexedDB === 'undefined') return null
    const meta = await storage.getMeta()
    if (!meta) return null
    return { storage, meta, pages: (await storage.listRecords()).length, passkeys: await listPasskeys(storage) }
  } catch {
    return null
  }
}

function marks(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(MARK) ?? '{}')
  } catch {
    return {}
  }
}

/** Whether this device diary has already been moved into this account. */
export function movedInto(legacy: LegacyDiary, account: string): boolean {
  return (marks()[legacy.meta.createdAt] ?? []).includes(account.toLowerCase())
}

function markMoved(legacy: LegacyDiary, account: string) {
  try {
    const all = marks()
    const list = new Set(all[legacy.meta.createdAt] ?? [])
    list.add(account.toLowerCase())
    all[legacy.meta.createdAt] = [...list]
    localStorage.setItem(MARK, JSON.stringify(all))
  } catch {
    /* only used to stop offering the move again */
  }
}

async function unlockLegacy(legacy: LegacyDiary, secret: LegacySecret): Promise<CryptoKey> {
  return 'phrase' in secret ? unlockWithPhrase(legacy.storage, secret.phrase) : unlockWithPasskey(secret.passkey)
}

/** Decrypts every page and the settings; throws (before anything is uploaded) if any of it doesn't open. */
async function readAll(legacy: LegacyDiary, key: CryptoKey): Promise<{ entries: Entry[]; settings: PrivateSettings }> {
  const [entries, settings] = await Promise.all([loadEntries(legacy.storage, key), loadPrivateSettings(legacy.storage, key)])
  return { entries, settings }
}

/** Case 1. Returns the diary's key, so the app can open the diary straight away. */
export async function moveIntoEmptyAccount(legacy: LegacyDiary, secret: LegacySecret, remote: RemoteStorage): Promise<{ key: CryptoKey; pages: number }> {
  const key = await unlockLegacy(legacy, secret)
  await readAll(legacy, key)
  const local = await legacy.storage.exportAll()
  if (!local.meta) throw new Error('No diary found on this device.')
  await remote.importDiary(local.meta, local.records, local.blobs)
  await verifyLanded(remote, local.records)
  markMoved(legacy, remote.account)
  return { key, pages: local.records.length }
}

/** Case 2. Needs the account diary's (unlocked) key. Returns the device diary's settings so they can be merged. */
export async function mergeIntoAccount(
  legacy: LegacyDiary,
  secret: LegacySecret,
  remote: RemoteStorage,
  accountKey: CryptoKey,
): Promise<{ added: number; skipped: number; settings: PrivateSettings }> {
  const legacyKey = await unlockLegacy(legacy, secret)
  const { entries, settings } = await readAll(legacy, legacyKey)
  const records: StoredRecord[] = await Promise.all(entries.map(async (e) => ({ id: e.id, sealed: await seal(accountKey, e, e.id) })))
  const result = records.length ? await remote.mergeRecords(records) : { added: 0, skipped: 0 }
  // Every page must now be in the account and open with the account's key.
  const server = await remote.serverExport()
  const byId = new Map(server.records.map((r) => [r.id, r]))
  for (const r of records) {
    const there = byId.get(r.id)
    if (!there) throw new Error('Some pages didn’t arrive. Nothing on this device was changed — please try again.')
    await open(accountKey, there.sealed, there.id)
  }
  markMoved(legacy, remote.account)
  return { ...result, settings }
}

/** Checks the server now holds every page byte-for-byte. */
async function verifyLanded(remote: RemoteStorage, records: StoredRecord[]) {
  const server = await remote.serverExport()
  const byId = new Map(server.records.map((r) => [r.id, r]))
  for (const r of records) {
    const there = byId.get(r.id)
    if (!there || there.sealed.iv !== r.sealed.iv || there.sealed.ct !== r.sealed.ct)
      throw new Error('Some pages didn’t arrive intact. Nothing on this device was changed — please try again.')
  }
}

/**
 * Removes the old copy from this browser. Only after it has been moved, and only when asked:
 * checks once more that every page from this device is in the account before deleting anything.
 */
export async function removeDeviceCopy(legacy: LegacyDiary, remote: RemoteStorage): Promise<void> {
  if (!movedInto(legacy, remote.account)) throw new Error('This diary hasn’t been moved into your account yet.')
  const local = await legacy.storage.listRecords()
  const server = new Set((await remote.serverExport()).records.map((r) => r.id))
  const missing = local.filter((r) => !server.has(r.id))
  if (missing.length)
    throw new Error(
      `${missing.length} page${missing.length === 1 ? '' : 's'} from this device aren’t in your account (maybe deleted there since). I’ve kept the device copy.`,
    )
  await legacy.storage.destroy()
}
