import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as account from '../lib/account'
import { ApiClient, OfflineError } from '../lib/api'
import { findLegacyDiary, mergeIntoAccount, moveIntoEmptyAccount, movedInto, removeDeviceCopy, type LegacyDiary, type LegacySecret } from '../lib/migrate'
import { RemoteStorage } from '../lib/remoteStorage'
import { requestPersistence, type PasskeyUnlock, type VaultStorage } from '../lib/storage'
import * as vault from '../lib/vault'
import type { Entry, PrivateSettings } from '../lib/types'

/**
 *  loading → signed-out → (sign in) → new | migrate | locked → unlocked
 *  'migrate': the account has no diary yet, but this browser holds one from before accounts.
 *  'offline': the server couldn't be reached to find out which.
 */
export type VaultStatus = 'loading' | 'offline' | 'signed-out' | 'new' | 'migrate' | 'locked' | 'unlocked'

type Flush = () => Promise<void> | void

interface Ctx {
  status: VaultStatus
  storage: VaultStorage
  /** The signed-in account's username. */
  account: string | null
  /** A diary from before accounts, still only in this browser and not yet moved into this account. */
  legacy: LegacyDiary | null
  /** Same, but already moved into this account (so its device copy can be removed). */
  movedLegacy: LegacyDiary | null
  /** Saves waiting to reach the server (e.g. while offline). */
  pending: number
  /** Why the app is asking to sign in again, if it's because a session ended. */
  notice: string
  entries: Entry[]
  privateSettings: PrivateSettings
  passkeys: PasskeyUnlock[]
  signIn: (username: string, password: string) => Promise<void>
  signUp: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  changeAccountPassword: (current: string, next: string) => Promise<void>
  /** Creates the vault (locked). Returns `enter`, which opens it — so setup can offer a passkey in between. */
  create: (phrase: string, name: string) => Promise<() => Promise<void>>
  /** Migration case 1: moves this browser's diary into the (empty) account and opens it. */
  moveLegacy: (secret: LegacySecret) => Promise<number>
  /** Migration case 2: adds this browser's older diary to the open account diary. */
  mergeLegacy: (secret: LegacySecret) => Promise<{ added: number; skipped: number }>
  removeLegacyCopy: () => Promise<void>
  /** From 'migrate': leave the device diary where it is and start a new one in the account. */
  startFresh: () => void
  unlockWithPhrase: (phrase: string) => Promise<void>
  unlockWithPasskey: (p: PasskeyUnlock) => Promise<void>
  lock: () => Promise<void>
  /** Resolves to 'queued' when the words are kept on this device until the server can be reached. */
  save: (entry: Entry) => Promise<'synced' | 'queued'>
  remove: (id: string) => Promise<void>
  updatePrivate: (patch: Partial<PrivateSettings>) => Promise<void>
  refreshPasskeys: () => Promise<void>
  reload: () => Promise<void>
  /** Lets an open editor save its words before the diary locks. */
  onBeforeLock: (fn: Flush) => () => void
}

const VaultContext = createContext<Ctx | null>(null)
const client = new ApiClient()
const storage = new RemoteStorage(client)
const EMPTY_SETTINGS: PrivateSettings = { name: '', customTags: [] }

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>('loading')
  const [accountName, setAccountName] = useState<string | null>(null)
  const [legacyDiary, setLegacyDiary] = useState<LegacyDiary | null>(null)
  const [pending, setPending] = useState(0)
  const [notice, setNotice] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [privateSettings, setPrivateSettings] = useState<PrivateSettings>(EMPTY_SETTINGS)
  const [passkeys, setPasskeys] = useState<PasskeyUnlock[]>([])
  // The key lives only here, in memory. It is dropped on lock and never persisted.
  const keyRef = useRef<CryptoKey | null>(null)
  const flushers = useRef(new Set<Flush>())
  const privateRef = useRef<PrivateSettings>(EMPTY_SETTINGS)

  const dropKey = useCallback(() => {
    keyRef.current = null
    privateRef.current = EMPTY_SETTINGS
    setEntries([])
    setPrivateSettings(EMPTY_SETTINGS)
  }, [])

  /** Works out where a signed-in account stands: diary in the account, one to move in from this browser, or none. */
  const settle = useCallback(async () => {
    const [meta, legacy] = await Promise.all([storage.getMeta(), findLegacyDiary()])
    setLegacyDiary(legacy)
    setPasskeys((meta?.unlocks ?? []).filter((u): u is PasskeyUnlock => u.type === 'passkey'))
    setPending(await storage.pendingCount())
    if (meta) setStatus('locked')
    else setStatus(legacy && !movedInto(legacy, storage.account) ? 'migrate' : 'new')
  }, [])

  const begin = useCallback(async () => {
    setStatus('loading')
    try {
      const acct = await account.currentAccount(client)
      if (!acct) {
        setLegacyDiary(await findLegacyDiary())
        setStatus('signed-out')
        return
      }
      storage.account = acct.username
      setAccountName(acct.username)
      await settle()
    } catch {
      setStatus('offline')
    }
  }, [settle])

  useEffect(() => {
    storage.onPendingChange = setPending
    // The session ended (expired, or signed out elsewhere): close the diary and ask to sign in again.
    // Anything not yet sent stays in the outbox and goes up after signing back in.
    client.onUnauthorized = () => {
      if (!storage.account) return // never signed in on this visit: nothing ended
      dropKey()
      setNotice('You were signed out. Sign in again to keep going — anything not sent yet is kept safe on this device.')
      setStatus('signed-out')
    }
    void begin()
  }, [begin, dropKey])

  // Retry waiting saves when the connection comes back, and every half minute while some are waiting.
  useEffect(() => {
    if (!accountName || status === 'signed-out') return
    const retry = () => void storage.sync().catch(() => {})
    window.addEventListener('online', retry)
    const t = pending ? setInterval(retry, 30_000) : undefined
    return () => {
      window.removeEventListener('online', retry)
      clearInterval(t)
    }
  }, [accountName, status, pending])

  const refreshPasskeys = useCallback(async () => setPasskeys(await vault.listPasskeys(storage)), [])

  const openWith = useCallback(async (key: CryptoKey) => {
    const [loaded, settings] = await Promise.all([vault.loadEntries(storage, key), vault.loadPrivateSettings(storage, key)])
    keyRef.current = key
    privateRef.current = settings
    setEntries(loaded)
    setPrivateSettings(settings)
    setStatus('unlocked')
    // Keeps the outbox (unsent saves) from being cleared by the browser under storage pressure.
    void requestPersistence()
  }, [])

  const signedIn = useCallback(
    async (acct: account.Account) => {
      storage.account = acct.username
      setAccountName(acct.username)
      setNotice('')
      await storage.sync().catch(() => {})
      await settle()
    },
    [settle],
  )

  const signIn = useCallback(async (u: string, p: string) => signedIn(await account.signIn(client, u, p)), [signedIn])
  const signUp = useCallback(async (u: string, p: string) => signedIn(await account.signUp(client, u, p)), [signedIn])

  const create = useCallback(
    async (phrase: string, name: string) => {
      const key = await vault.createVault(storage, phrase)
      if (name) await vault.savePrivateSettings(storage, key, { ...EMPTY_SETTINGS, name })
      return async () => {
        await refreshPasskeys()
        await openWith(key)
      }
    },
    [openWith, refreshPasskeys],
  )

  const moveLegacy = useCallback(
    async (secret: LegacySecret) => {
      if (!legacyDiary) throw new Error('No diary found on this device.')
      const { key, pages } = await moveIntoEmptyAccount(legacyDiary, secret, storage)
      await refreshPasskeys()
      await openWith(key)
      return pages
    },
    [legacyDiary, openWith, refreshPasskeys],
  )

  const startFresh = useCallback(() => setStatus('new'), [])

  const unlockWithPhrase = useCallback(
    async (phrase: string) => openWith(await vault.unlockWithPhrase(storage, phrase)),
    [openWith],
  )
  const unlockWithPasskey = useCallback(
    async (p: PasskeyUnlock) => openWith(await vault.unlockWithPasskey(p)),
    [openWith],
  )

  const lock = useCallback(async () => {
    if (!keyRef.current) return
    for (const f of flushers.current) {
      try {
        await f()
      } catch {
        /* never let a failed save keep the diary open */
      }
    }
    dropKey()
    setStatus('locked')
  }, [dropKey])

  const signOut = useCallback(async () => {
    await lock()
    try {
      await account.signOut(client)
    } catch (err) {
      if (err instanceof OfflineError) throw err
    }
    dropKey()
    storage.account = ''
    setAccountName(null)
    setPasskeys([])
    setNotice('')
    setLegacyDiary(await findLegacyDiary())
    setStatus('signed-out')
  }, [lock, dropKey])

  const changeAccountPassword = useCallback(
    async (current: string, next: string) => account.changeAccountPassword(client, storage.account, current, next),
    [],
  )

  const requireKey = () => {
    if (!keyRef.current) throw new Error('The diary is locked.')
    return keyRef.current
  }

  const save = useCallback(async (entry: Entry) => {
    await vault.saveEntry(storage, requireKey(), entry)
    setEntries((prev) => {
      const rest = prev.filter((e) => e.id !== entry.id)
      return [entry, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    })
    return (await storage.isPending('record', entry.id)) ? 'queued' : 'synced'
  }, [])

  const remove = useCallback(async (id: string) => {
    await vault.deleteEntry(storage, id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const updatePrivate = useCallback(async (patch: Partial<PrivateSettings>) => {
    const key = requireKey()
    const next = { ...privateRef.current, ...patch }
    privateRef.current = next
    setPrivateSettings(next)
    await vault.savePrivateSettings(storage, key, next)
  }, [])

  const mergeLegacy = useCallback(
    async (secret: LegacySecret) => {
      if (!legacyDiary) throw new Error('No older diary found on this device.')
      const key = requireKey()
      const { added, skipped, settings } = await mergeIntoAccount(legacyDiary, secret, storage, key)
      const tags = [...new Set([...privateRef.current.customTags, ...settings.customTags])]
      if (tags.length !== privateRef.current.customTags.length || (!privateRef.current.name && settings.name))
        await updatePrivate({ customTags: tags, name: privateRef.current.name || settings.name })
      setEntries(await vault.loadEntries(storage, key))
      setLegacyDiary({ ...legacyDiary })
      return { added, skipped }
    },
    [legacyDiary, updatePrivate],
  )

  const removeLegacyCopy = useCallback(async () => {
    if (!legacyDiary) return
    await removeDeviceCopy(legacyDiary, storage)
    setLegacyDiary(null)
  }, [legacyDiary])

  const reload = useCallback(async () => {
    dropKey()
    if (!storage.account) return begin()
    try {
      await settle()
    } catch {
      setStatus('offline')
    }
  }, [dropKey, settle, begin])

  const onBeforeLock = useCallback((fn: Flush) => {
    flushers.current.add(fn)
    return () => {
      flushers.current.delete(fn)
    }
  }, [])

  const moved = !!legacyDiary && !!accountName && movedInto(legacyDiary, accountName)
  const value = useMemo<Ctx>(
    () => ({
      status,
      storage,
      account: accountName,
      legacy: legacyDiary && !moved ? legacyDiary : null,
      movedLegacy: moved ? legacyDiary : null,
      pending,
      notice,
      entries,
      privateSettings,
      passkeys,
      signIn,
      signUp,
      signOut,
      changeAccountPassword,
      create,
      moveLegacy,
      mergeLegacy,
      removeLegacyCopy,
      startFresh,
      unlockWithPhrase,
      unlockWithPasskey,
      lock,
      save,
      remove,
      updatePrivate,
      refreshPasskeys,
      reload,
      onBeforeLock,
    }),
    [status, accountName, legacyDiary, moved, pending, notice, entries, privateSettings, passkeys, signIn, signUp, signOut, changeAccountPassword, create, moveLegacy, mergeLegacy, removeLegacyCopy, startFresh, unlockWithPhrase, unlockWithPasskey, lock, save, remove, updatePrivate, refreshPasskeys, reload, onBeforeLock],
  )
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault(): Ctx {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault outside provider')
  return ctx
}
