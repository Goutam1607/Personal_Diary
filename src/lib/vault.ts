import {
  PBKDF2_ITERATIONS,
  deriveKeyFromPhrase,
  deriveKeyFromPrf,
  fromBase64,
  generateVaultKey,
  open,
  randomBytes,
  seal,
  toBase64,
  unwrapVaultKey,
  wrapVaultKey,
} from './crypto'
import { createPasskey, evaluatePrf } from './passkey'
import type { PasskeyUnlock, PhraseUnlock, StoredRecord, VaultMeta, VaultStorage } from './storage'
import type { Entry, PrivateSettings } from './types'

export const MIN_PHRASE_LENGTH = 8
const SETTINGS_KEY = 'settings'

export class WrongSecretError extends Error {
  constructor() {
    super("That doesn't seem to be the right phrase.")
  }
}

export async function hasVault(storage: VaultStorage): Promise<boolean> {
  return !!(await storage.getMeta())
}

export async function createVault(storage: VaultStorage, phrase: string): Promise<CryptoKey> {
  if (phrase.length < MIN_PHRASE_LENGTH) throw new Error(`Please use at least ${MIN_PHRASE_LENGTH} characters.`)
  const vaultKey = await generateVaultKey()
  const salt = randomBytes(16)
  const kek = await deriveKeyFromPhrase(phrase, salt)
  const phraseUnlock: PhraseUnlock = {
    type: 'phrase',
    salt: toBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    wrapped: await wrapVaultKey(vaultKey, kek),
  }
  await storage.putMeta({ version: 1, createdAt: new Date().toISOString(), unlocks: [phraseUnlock] })
  // Hand back a non-extractable copy for day-to-day use.
  return unwrapVaultKey(phraseUnlock.wrapped, kek)
}

async function phraseUnlockOf(storage: VaultStorage): Promise<{ meta: VaultMeta; unlock: PhraseUnlock }> {
  const meta = await storage.getMeta()
  const unlock = meta?.unlocks.find((u): u is PhraseUnlock => u.type === 'phrase')
  if (!meta || !unlock) throw new Error('No diary found on this device.')
  return { meta, unlock }
}

export async function unlockWithPhrase(storage: VaultStorage, phrase: string, extractable = false): Promise<CryptoKey> {
  const { unlock } = await phraseUnlockOf(storage)
  const kek = await deriveKeyFromPhrase(phrase, fromBase64(unlock.salt), unlock.iterations)
  try {
    return await unwrapVaultKey(unlock.wrapped, kek, extractable)
  } catch {
    throw new WrongSecretError()
  }
}

export async function listPasskeys(storage: VaultStorage): Promise<PasskeyUnlock[]> {
  const meta = await storage.getMeta()
  return (meta?.unlocks ?? []).filter((u): u is PasskeyUnlock => u.type === 'passkey')
}

export async function unlockWithPasskey(passkey: PasskeyUnlock): Promise<CryptoKey> {
  const prf = await evaluatePrf(passkey.credentialId, passkey.prfSalt)
  const kek = await deriveKeyFromPrf(prf, fromBase64(passkey.hkdfSalt))
  return unwrapVaultKey(passkey.wrapped, kek)
}

/**
 * Adding a passkey needs your secret phrase once, because the in-memory vault key is
 * deliberately non-extractable and can't be re-wrapped without it.
 */
export async function addPasskey(storage: VaultStorage, phrase: string, label: string): Promise<PasskeyUnlock> {
  const extractableKey = await unlockWithPhrase(storage, phrase, true)
  const created = await createPasskey(label)
  const hkdfSalt = randomBytes(16)
  const kek = await deriveKeyFromPrf(created.prfOutput, hkdfSalt)
  const passkey: PasskeyUnlock = {
    type: 'passkey',
    credentialId: created.credentialId,
    prfSalt: created.prfSalt,
    hkdfSalt: toBase64(hkdfSalt),
    label,
    createdAt: new Date().toISOString(),
    wrapped: await wrapVaultKey(extractableKey, kek),
  }
  const meta = (await storage.getMeta())!
  await storage.putMeta({ ...meta, unlocks: [...meta.unlocks, passkey] })
  return passkey
}

export async function removePasskey(storage: VaultStorage, credentialId: string): Promise<void> {
  const meta = (await storage.getMeta())!
  await storage.putMeta({
    ...meta,
    unlocks: meta.unlocks.filter((u) => u.type !== 'passkey' || u.credentialId !== credentialId),
  })
}

export async function changePhrase(storage: VaultStorage, current: string, next: string): Promise<void> {
  if (next.length < MIN_PHRASE_LENGTH) throw new Error(`Please use at least ${MIN_PHRASE_LENGTH} characters.`)
  const extractableKey = await unlockWithPhrase(storage, current, true)
  const salt = randomBytes(16)
  const kek = await deriveKeyFromPhrase(next, salt)
  const replacement: PhraseUnlock = {
    type: 'phrase',
    salt: toBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    wrapped: await wrapVaultKey(extractableKey, kek),
  }
  const { meta } = await phraseUnlockOf(storage)
  await storage.putMeta({ ...meta, unlocks: meta.unlocks.map((u) => (u.type === 'phrase' ? replacement : u)) })
}

// ---- entries -------------------------------------------------------------

export async function loadEntries(storage: VaultStorage, key: CryptoKey): Promise<Entry[]> {
  const records = await storage.listRecords()
  const entries = await Promise.all(records.map((r) => open<Entry>(key, r.sealed, r.id)))
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function saveEntry(storage: VaultStorage, key: CryptoKey, entry: Entry): Promise<void> {
  const record: StoredRecord = { id: entry.id, sealed: await seal(key, entry, entry.id) }
  await storage.putRecord(record)
}

export function deleteEntry(storage: VaultStorage, id: string): Promise<void> {
  return storage.deleteRecord(id)
}

export async function loadPrivateSettings(storage: VaultStorage, key: CryptoKey): Promise<PrivateSettings> {
  const blob = await storage.getBlob(SETTINGS_KEY)
  const defaults: PrivateSettings = { name: '', customTags: [] }
  return blob ? { ...defaults, ...(await open<PrivateSettings>(key, blob, SETTINGS_KEY)) } : defaults
}

export async function savePrivateSettings(storage: VaultStorage, key: CryptoKey, settings: PrivateSettings) {
  await storage.putBlob(SETTINGS_KEY, await seal(key, settings, SETTINGS_KEY))
}

// ---- backups -------------------------------------------------------------

export interface BackupFile {
  app: 'little-corner'
  format: 1
  exportedAt: string
  meta: VaultMeta
  records: StoredRecord[]
  blobs: Record<string, import('./crypto').Sealed>
}

/** The backup is exactly what's on disk: still encrypted, only openable with your secret phrase. */
export async function exportBackup(storage: VaultStorage): Promise<BackupFile> {
  const { meta, records, blobs } = await storage.exportAll()
  if (!meta) throw new Error('Nothing to back up yet.')
  return { app: 'little-corner', format: 1, exportedAt: new Date().toISOString(), meta, records, blobs }
}

/**
 * Restores a backup after proving the phrase opens it. Passkeys are dropped because they are
 * bound to the website address they were created on; you can add them again afterwards.
 */
async function backupKey(file: BackupFile, phrase: string): Promise<{ key: CryptoKey; phraseUnlock: PhraseUnlock }> {
  if (file?.app !== 'little-corner' || file.format !== 1) throw new Error("This doesn't look like a diary backup.")
  const phraseUnlock = file.meta.unlocks.find((u): u is PhraseUnlock => u.type === 'phrase')
  if (!phraseUnlock) throw new Error('This backup has no secret phrase.')
  const kek = await deriveKeyFromPhrase(phrase, fromBase64(phraseUnlock.salt), phraseUnlock.iterations)
  try {
    return { key: await unwrapVaultKey(phraseUnlock.wrapped, kek), phraseUnlock }
  } catch {
    throw new WrongSecretError()
  }
}

/** Decrypts a backup in memory, without touching the diary on this device. */
export async function openBackup(file: BackupFile, phrase: string): Promise<{ entries: Entry[]; settings: PrivateSettings }> {
  const { key } = await backupKey(file, phrase)
  const entries = await Promise.all(file.records.map((r) => open<Entry>(key, r.sealed, r.id)))
  const blob = file.blobs?.[SETTINGS_KEY]
  const settings: PrivateSettings = { name: '', customTags: [], ...(blob ? await open<PrivateSettings>(key, blob, SETTINGS_KEY) : {}) }
  return { entries, settings }
}

export async function importBackup(storage: VaultStorage, file: BackupFile, phrase: string): Promise<void> {
  const { key, phraseUnlock } = await backupKey(file, phrase)
  // Make sure the contents really decrypt before replacing anything.
  await Promise.all(file.records.map((r) => open(key, r.sealed, r.id)))
  const meta: VaultMeta = { ...file.meta, unlocks: [phraseUnlock] }
  // A backup restored on the same device can keep its passkeys (they still exist here).
  const existingIds = new Set((await listPasskeys(storage)).map((p) => p.credentialId))
  for (const u of file.meta.unlocks) {
    if (u.type === 'passkey' && existingIds.has(u.credentialId)) meta.unlocks.push(u)
  }
  await storage.replaceAll(meta, file.records, file.blobs)
}
