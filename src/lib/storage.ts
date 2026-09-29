import type { Sealed, WrappedKey } from './crypto'

/**
 * Everything the diary persists goes through this interface.
 * Only ciphertext and non-secret key-derivation parameters ever cross it, which is
 * what makes it safe to later add a remote/sync implementation: a server would only
 * ever see sealed blobs it cannot read.
 */
export interface VaultStorage {
  getMeta(): Promise<VaultMeta | undefined>
  putMeta(meta: VaultMeta): Promise<void>
  getBlob(key: string): Promise<Sealed | undefined>
  putBlob(key: string, value: Sealed): Promise<void>
  listRecords(): Promise<StoredRecord[]>
  putRecord(record: StoredRecord): Promise<void>
  deleteRecord(id: string): Promise<void>
  replaceAll(meta: VaultMeta, records: StoredRecord[], blobs: Record<string, Sealed>): Promise<void>
  exportAll(): Promise<{ meta?: VaultMeta; records: StoredRecord[]; blobs: Record<string, Sealed> }>
  destroy(): Promise<void>
}

export interface PhraseUnlock {
  type: 'phrase'
  salt: string
  iterations: number
  wrapped: WrappedKey
}

export interface PasskeyUnlock {
  type: 'passkey'
  credentialId: string
  /** Salt sent to the authenticator's PRF; not secret. */
  prfSalt: string
  hkdfSalt: string
  label: string
  createdAt: string
  wrapped: WrappedKey
}

export type UnlockMethod = PhraseUnlock | PasskeyUnlock

export interface VaultMeta {
  version: 1
  createdAt: string
  unlocks: UnlockMethod[]
}

/** An encrypted diary entry. The id is random and reveals nothing; everything else is inside `sealed`. */
export interface StoredRecord {
  id: string
  sealed: Sealed
}

const DB_NAME = 'little-corner'
const DB_VERSION = 1

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
  })
}

export class IndexedDbStorage implements VaultStorage {
  private dbPromise: Promise<IDBDatabase> | null = null
  constructor(private readonly name = DB_NAME) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const open = indexedDB.open(this.name, DB_VERSION)
        open.onupgradeneeded = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
          if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs')
          if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' })
        }
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => reject(open.error)
      })
    }
    return this.dbPromise
  }

  private async store(name: string, mode: IDBTransactionMode = 'readonly') {
    const tx = (await this.db()).transaction(name, mode)
    return { tx, store: tx.objectStore(name) }
  }

  async getMeta() {
    const { store } = await this.store('meta')
    return req<VaultMeta | undefined>(store.get('vault'))
  }

  async putMeta(meta: VaultMeta) {
    const { tx, store } = await this.store('meta', 'readwrite')
    store.put(meta, 'vault')
    await done(tx)
  }

  async getBlob(key: string) {
    const { store } = await this.store('blobs')
    return req<Sealed | undefined>(store.get(key))
  }

  async putBlob(key: string, value: Sealed) {
    const { tx, store } = await this.store('blobs', 'readwrite')
    store.put(value, key)
    await done(tx)
  }

  async listRecords() {
    const { store } = await this.store('records')
    return req<StoredRecord[]>(store.getAll())
  }

  async putRecord(record: StoredRecord) {
    const { tx, store } = await this.store('records', 'readwrite')
    store.put(record)
    await done(tx)
  }

  async deleteRecord(id: string) {
    const { tx, store } = await this.store('records', 'readwrite')
    store.delete(id)
    await done(tx)
  }

  async exportAll() {
    const db = await this.db()
    const tx = db.transaction(['meta', 'records', 'blobs'])
    const meta = await req<VaultMeta | undefined>(tx.objectStore('meta').get('vault'))
    const records = await req<StoredRecord[]>(tx.objectStore('records').getAll())
    const blobStore = tx.objectStore('blobs')
    const keys = (await req(blobStore.getAllKeys())) as string[]
    const values = await req<Sealed[]>(blobStore.getAll())
    const blobs: Record<string, Sealed> = {}
    keys.forEach((k, i) => (blobs[k] = values[i]))
    return { meta, records, blobs }
  }

  async replaceAll(meta: VaultMeta, records: StoredRecord[], blobs: Record<string, Sealed>) {
    const db = await this.db()
    const tx = db.transaction(['meta', 'records', 'blobs'], 'readwrite')
    tx.objectStore('meta').clear()
    tx.objectStore('records').clear()
    tx.objectStore('blobs').clear()
    tx.objectStore('meta').put(meta, 'vault')
    for (const r of records) tx.objectStore('records').put(r)
    for (const [k, v] of Object.entries(blobs)) tx.objectStore('blobs').put(v, k)
    await done(tx)
  }

  async destroy() {
    const db = await this.db()
    db.close()
    this.dbPromise = null
    await new Promise<void>((resolve, reject) => {
      const del = indexedDB.deleteDatabase(this.name)
      del.onsuccess = () => resolve()
      del.onerror = () => reject(del.error)
      del.onblocked = () => resolve()
    })
  }
}
