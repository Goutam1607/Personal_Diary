import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IndexedDbStorage, type PasskeyUnlock, type VaultStorage } from '../lib/storage'
import * as vault from '../lib/vault'
import type { Entry, PrivateSettings } from '../lib/types'

export type VaultStatus = 'loading' | 'new' | 'locked' | 'unlocked' | 'unavailable'

type Flush = () => Promise<void> | void

interface Ctx {
  status: VaultStatus
  storage: VaultStorage
  entries: Entry[]
  privateSettings: PrivateSettings
  passkeys: PasskeyUnlock[]
  /** Creates the vault (locked). Returns `enter`, which opens it — so setup can offer a passkey in between. */
  create: (phrase: string, name: string) => Promise<() => Promise<void>>
  unlockWithPhrase: (phrase: string) => Promise<void>
  unlockWithPasskey: (p: PasskeyUnlock) => Promise<void>
  lock: () => Promise<void>
  save: (entry: Entry) => Promise<void>
  remove: (id: string) => Promise<void>
  updatePrivate: (patch: Partial<PrivateSettings>) => Promise<void>
  refreshPasskeys: () => Promise<void>
  reload: () => Promise<void>
  /** Lets an open editor save its words before the diary locks. */
  onBeforeLock: (fn: Flush) => () => void
}

const VaultContext = createContext<Ctx | null>(null)
const storage: VaultStorage = new IndexedDbStorage()
const EMPTY_SETTINGS: PrivateSettings = { name: '', customTags: [] }

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>('loading')
  const [entries, setEntries] = useState<Entry[]>([])
  const [privateSettings, setPrivateSettings] = useState<PrivateSettings>(EMPTY_SETTINGS)
  const [passkeys, setPasskeys] = useState<PasskeyUnlock[]>([])
  // The key lives only here, in memory. It is dropped on lock and never persisted.
  const keyRef = useRef<CryptoKey | null>(null)
  const flushers = useRef(new Set<Flush>())
  const privateRef = useRef<PrivateSettings>(EMPTY_SETTINGS)

  const refreshPasskeys = useCallback(async () => setPasskeys(await vault.listPasskeys(storage)), [])

  useEffect(() => {
    ;(async () => {
      try {
        const exists = await vault.hasVault(storage)
        await refreshPasskeys()
        setStatus(exists ? 'locked' : 'new')
      } catch {
        setStatus('unavailable')
      }
    })()
  }, [refreshPasskeys])

  const openWith = useCallback(async (key: CryptoKey) => {
    const [loaded, settings] = await Promise.all([vault.loadEntries(storage, key), vault.loadPrivateSettings(storage, key)])
    keyRef.current = key
    privateRef.current = settings
    setEntries(loaded)
    setPrivateSettings(settings)
    setStatus('unlocked')
  }, [])

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
    keyRef.current = null
    privateRef.current = EMPTY_SETTINGS
    setEntries([])
    setPrivateSettings(EMPTY_SETTINGS)
    setStatus('locked')
  }, [])

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

  const reload = useCallback(async () => {
    keyRef.current = null
    setEntries([])
    await refreshPasskeys()
    setStatus((await vault.hasVault(storage)) ? 'locked' : 'new')
  }, [refreshPasskeys])

  const onBeforeLock = useCallback((fn: Flush) => {
    flushers.current.add(fn)
    return () => {
      flushers.current.delete(fn)
    }
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      status,
      storage,
      entries,
      privateSettings,
      passkeys,
      create,
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
    [status, entries, privateSettings, passkeys, create, unlockWithPhrase, unlockWithPasskey, lock, save, remove, updatePrivate, refreshPasskeys, reload, onBeforeLock],
  )
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault(): Ctx {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault outside provider')
  return ctx
}
