import { ApiError, OfflineError, type ApiClient } from './api'
import type { Sealed } from './crypto'
import type { StoredRecord, VaultMeta, VaultStorage } from './storage'

/**
 * The diary's storage since it moved to the server: the database is the source of truth.
 *
 * Like before, only ciphertext crosses this interface — entries are sealed in the browser with the
 * vault key, so the server stores pages it cannot read.
 *
 * Writes go through a small outbox kept in IndexedDB (still only ciphertext). Each save is written
 * there first and removed once the server confirms it, so a dropped connection, a server restart or
 * an expired session never loses words: they're sent the next time the diary can reach the server.
 * The outbox is a waiting room, never the diary's only home.
 */

type Kind = 'record' | 'blob'

interface PendingOp {
  key: string
  account: string
  kind: Kind
  id: string
  op: 'put' | 'delete'
  sealed?: Sealed
  seq: number
}

const OUTBOX_DB = 'little-corner-outbox'

/** Pending writes, per account. Falls back to memory where IndexedDB is unavailable (e.g. some private windows). */
export class Outbox {
  private dbPromise: Promise<IDBDatabase | null> | null = null
  private memory = new Map<string, PendingOp>()
  private seq = Date.now()

  constructor(private readonly name = OUTBOX_DB) {}

  private db(): Promise<IDBDatabase | null> {
    this.dbPromise ??= new Promise((resolve) => {
      try {
        const open = indexedDB.open(this.name, 1)
        open.onupgradeneeded = () => open.result.createObjectStore('ops', { keyPath: 'key' })
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
    return this.dbPromise
  }

  private async run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    const db = await this.db()
    if (!db) return undefined
    return new Promise((resolve, reject) => {
      const tx = db.transaction('ops', mode)
      const req = fn(tx.objectStore('ops'))
      tx.oncomplete = () => resolve(req ? req.result : undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
    })
  }

  async put(op: Omit<PendingOp, 'key' | 'seq'>): Promise<PendingOp> {
    const full: PendingOp = { ...op, key: `${op.account}|${op.kind}|${op.id}`, seq: ++this.seq }
    if (await this.db()) await this.run('readwrite', (s) => void s.put(full))
    else this.memory.set(full.key, full)
    return full
  }

  async list(account: string): Promise<PendingOp[]> {
    const all = (await this.db()) ? ((await this.run('readonly', (s) => s.getAll() as IDBRequest<PendingOp[]>)) ?? []) : [...this.memory.values()]
    return all.filter((o) => o.account === account).sort((a, b) => a.seq - b.seq)
  }

  /** Removes the op only if it hasn't been replaced by a newer save in the meantime. */
  async settle(op: PendingOp): Promise<void> {
    if (!(await this.db())) {
      if (this.memory.get(op.key)?.seq === op.seq) this.memory.delete(op.key)
      return
    }
    await this.run('readwrite', (s) => {
      const req = s.get(op.key)
      req.onsuccess = () => {
        if ((req.result as PendingOp | undefined)?.seq === op.seq) s.delete(op.key)
      }
    })
  }

  async clear(account: string): Promise<void> {
    for (const op of await this.list(account)) await this.settle(op)
  }
}

export interface ServerExport {
  meta: VaultMeta
  rev: number
  records: StoredRecord[]
  blobs: Record<string, Sealed>
}

const path = (kind: Kind, id: string) => `/api/vault/${kind === 'record' ? 'records' : 'blobs'}/${encodeURIComponent(id)}`

/** Errors that mean "try again later" rather than "this can never be saved". */
function retryable(err: unknown): boolean {
  return err instanceof OfflineError || (err instanceof ApiError && (err.status === 401 || err.status === 429 || err.status >= 500))
}

export class RemoteStorage implements VaultStorage {
  /** The signed-in account; scopes the outbox so two people sharing a browser never mix pending saves. */
  account = ''
  /** Told how many saves are still waiting for the server. */
  onPendingChange: ((count: number) => void) | null = null
  private rev = 0
  private chain: Promise<unknown> = Promise.resolve()

  constructor(
    readonly client: ApiClient,
    readonly outbox = new Outbox(),
  ) {}

  // ---- vault metadata (wrapped keys) ----

  async getMeta(): Promise<VaultMeta | undefined> {
    try {
      const res = await this.client.get<{ meta: VaultMeta; rev: number }>('/api/vault')
      this.rev = res.rev
      return res.meta
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        this.rev = 0
        return undefined
      }
      throw err
    }
  }

  /** Never queued: key changes need the server to confirm them (and to refuse stale ones). */
  async putMeta(meta: VaultMeta): Promise<void> {
    const res = await this.client.put<{ rev: number }>('/api/vault/meta', { meta, rev: this.rev })
    this.rev = res.rev
  }

  // ---- entries and settings ----

  async getBlob(key: string): Promise<Sealed | undefined> {
    const pending = (await this.outbox.list(this.account)).find((o) => o.kind === 'blob' && o.id === key)
    if (pending) return pending.op === 'put' ? pending.sealed : undefined
    try {
      return (await this.client.get<{ sealed: Sealed }>(path('blob', key))).sealed
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return undefined
      throw err
    }
  }

  putBlob(key: string, value: Sealed): Promise<void> {
    return this.write('blob', key, 'put', value)
  }

  async listRecords(): Promise<StoredRecord[]> {
    void this.sync()
    const [{ records }, pending] = await Promise.all([
      this.client.get<{ records: StoredRecord[] }>('/api/vault/records'),
      this.outbox.list(this.account),
    ])
    return [...this.overlay(records, pending).values()]
  }

  putRecord(record: StoredRecord): Promise<void> {
    return this.write('record', record.id, 'put', record.sealed)
  }

  deleteRecord(id: string): Promise<void> {
    return this.write('record', id, 'delete')
  }

  /** True while a save of this item is waiting in the outbox (e.g. offline). */
  async isPending(kind: Kind, id: string): Promise<boolean> {
    return (await this.outbox.list(this.account)).some((o) => o.kind === kind && o.id === id)
  }

  async pendingCount(): Promise<number> {
    return (await this.outbox.list(this.account)).length
  }

  private overlay(records: StoredRecord[], pending: PendingOp[]): Map<string, StoredRecord> {
    const byId = new Map(records.map((r) => [r.id, r]))
    for (const p of pending) {
      if (p.kind !== 'record') continue
      if (p.op === 'put') byId.set(p.id, { id: p.id, sealed: p.sealed! })
      else byId.delete(p.id)
    }
    return byId
  }

  /**
   * Keeps the write in the outbox, then tries to send it. Resolves once it's safely stored — on the
   * server, or (if the server can't be reached right now) in the outbox to be sent later. Throws only
   * if the server refused it outright; the words still stay in the outbox.
   */
  private async write(kind: Kind, id: string, op: 'put' | 'delete', sealed?: Sealed): Promise<void> {
    await this.outbox.put({ account: this.account, kind, id, op, sealed })
    const failures = await this.sync()
    const mine = failures.find((f) => f.op.kind === kind && f.op.id === id)
    if (mine && !retryable(mine.error)) throw mine.error
  }

  /** Sends everything waiting in the outbox, oldest first, one at a time. Returns what couldn't be sent. */
  sync(): Promise<{ op: PendingOp; error: unknown }[]> {
    const run = this.chain.then(async () => {
      const failures: { op: PendingOp; error: unknown }[] = []
      const ops = await this.outbox.list(this.account)
      for (const op of ops) {
        try {
          if (op.op === 'put') await this.client.put(path(op.kind, op.id), op.sealed)
          else await this.client.delete(path(op.kind, op.id))
          await this.outbox.settle(op)
        } catch (error) {
          failures.push({ op, error })
          // No connection (or no session): the rest would fail the same way. Keep them all for later.
          if (retryable(error)) {
            for (const rest of ops.slice(ops.indexOf(op) + 1)) failures.push({ op: rest, error })
            break
          }
        }
      }
      this.onPendingChange?.(await this.pendingCount())
      return failures
    })
    this.chain = run.catch(() => {})
    return run
  }

  // ---- whole-diary operations ----

  /** Needs every pending save sent first, so nothing in the outbox is left behind or lost. */
  private async requireSynced(what: string) {
    await this.sync()
    if (await this.pendingCount()) throw new Error(`Some of your words haven’t reached the server yet, so I can’t ${what} right now. Please try again when you’re online.`)
  }

  /** The whole diary for a backup, including any saves still waiting in the outbox, so a backup is never missing your newest words. */
  async exportAll(): Promise<{ meta?: VaultMeta; records: StoredRecord[]; blobs: Record<string, Sealed> }> {
    await this.sync()
    const [res, pending] = await Promise.all([this.client.get<ServerExport>('/api/vault/export'), this.outbox.list(this.account)])
    this.rev = res.rev
    const blobs = { ...res.blobs }
    for (const p of pending) if (p.kind === 'blob' && p.op === 'put') blobs[p.id] = p.sealed!
    return { meta: res.meta, records: [...this.overlay(res.records, pending).values()], blobs }
  }

  /** Restoring a backup. The server archives the current diary before replacing it. */
  async replaceAll(meta: VaultMeta, records: StoredRecord[], blobs: Record<string, Sealed>): Promise<void> {
    await this.requireSynced('restore a backup')
    const res = await this.client.post<{ rev: number }>('/api/vault/replace', { meta, records, blobs, rev: this.rev })
    this.rev = res.rev
  }

  /** "Erase my diary". The server keeps an encrypted archive for its recovery window. */
  async destroy(): Promise<void> {
    await this.client.delete('/api/vault', { confirm: 'erase' })
    await this.outbox.clear(this.account)
    this.rev = 0
    this.onPendingChange?.(0)
  }

  // ---- migration from a diary that lived only in this browser ----

  /** Uploads a whole diary, exactly as encrypted, into an account that has none. The server refuses if one exists. */
  async importDiary(meta: VaultMeta, records: StoredRecord[], blobs: Record<string, Sealed>): Promise<void> {
    const res = await this.client.post<{ rev: number }>('/api/vault/import', { meta, records, blobs })
    this.rev = res.rev
  }

  /** Adds entries to the existing diary; ones whose id already exists there are skipped, never overwritten. */
  mergeRecords(records: StoredRecord[]): Promise<{ added: number; skipped: number }> {
    return this.client.post('/api/vault/records/merge', { records })
  }

  /** The server's copy, ignoring the outbox — used to verify a migration really landed. */
  serverExport(): Promise<ServerExport> {
    return this.client.get<ServerExport>('/api/vault/export')
  }
}
