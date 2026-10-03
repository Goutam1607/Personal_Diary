import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AttemptLimiter, burnPasswordCheck, hashPassword, hashToken, newSessionToken, verifyPassword } from './auth.ts'
import type { Db, Queryable } from './db.ts'

/**
 * The diary API. Rules every route follows:
 *  - The user is taken ONLY from the session cookie (looked up server-side). No route accepts a user
 *    id from the client, and every query on diary data is scoped with `user_id = <session user>`.
 *  - All SQL is parameterised.
 *  - Nothing from request bodies is logged: no diary content (it's ciphertext anyway), no passwords,
 *    no tokens, no usernames.
 *  - Diary content arrives already encrypted by the browser; this server can't decrypt it.
 */

export interface AppOptions {
  db: Db
  /** Secure, __Host- prefixed cookies. On in production (HTTPS); off only for http://localhost development. */
  secureCookies: boolean
  /** Read the client address from X-Forwarded-For (behind Render's proxy). */
  trustProxy?: boolean
  allowSignups?: boolean
  /** New accounts allowed per address per hour (default 10). */
  signupsPerHour?: number
  /**
   * Maintenance: refuse every change (503) while still serving reads, e.g. while the database is
   * being copied somewhere else. Browsers keep unsent saves in their encrypted outbox and send them
   * once writes are allowed again, so nothing typed during maintenance is lost.
   */
  readOnly?: boolean
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

const SESSION_DAYS = 30
const MAX_ITEM_CHARS = 2_000_000 // one sealed entry; a whole novel fits comfortably
const MAX_ITEMS_PER_USER = 50_000
const MAX_BYTES_PER_USER = 250_000_000
const SMALL_BODY = 64 * 1024
const ITEM_BODY = MAX_ITEM_CHARS + 4096
const BULK_BODY = 50 * 1024 * 1024 // a whole diary on import/restore
/** Autosave runs every few seconds while typing; only versions that sat untouched this long are archived on overwrite. */
const SETTLED = "interval '10 minutes'"

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// ---- validation ------------------------------------------------------------

const B64 = /^[A-Za-z0-9+/]*={0,2}$/
const ID = /^[A-Za-z0-9_-]{1,100}$/
const USERNAME = /^[A-Za-z0-9._@+-]{3,64}$/

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function b64(v: unknown, max: number, what: string): string {
  if (typeof v !== 'string' || !v.length || v.length > max || !B64.test(v)) throw new HttpError(400, `Invalid ${what}.`)
  return v
}

function str(v: unknown, max: number, what: string): string {
  if (typeof v !== 'string' || v.length > max) throw new HttpError(400, `Invalid ${what}.`)
  return v
}

function itemId(v: unknown): string {
  if (typeof v !== 'string' || !ID.test(v)) throw new HttpError(400, 'Invalid id.')
  return v
}

interface Sealed {
  iv: string
  ct: string
}

function sealed(v: unknown): Sealed {
  if (!isObj(v)) throw new HttpError(400, 'Invalid encrypted item.')
  return { iv: b64(v.iv, 32, 'iv'), ct: b64(v.ct, MAX_ITEM_CHARS, 'ciphertext') }
}

function wrapped(v: unknown) {
  if (!isObj(v)) throw new HttpError(400, 'Invalid wrapped key.')
  return { iv: b64(v.iv, 32, 'iv'), data: b64(v.data, 128, 'wrapped key') }
}

/** Checks the vault's key metadata and rebuilds it from known fields only. It must always keep a phrase unlock. */
function vaultMeta(v: unknown) {
  if (!isObj(v) || v.version !== 1 || !Array.isArray(v.unlocks) || v.unlocks.length < 1 || v.unlocks.length > 20)
    throw new HttpError(400, 'Invalid diary metadata.')
  const unlocks = v.unlocks.map((u) => {
    if (!isObj(u)) throw new HttpError(400, 'Invalid unlock method.')
    if (u.type === 'phrase') {
      const iterations = u.iterations
      if (typeof iterations !== 'number' || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 10_000_000)
        throw new HttpError(400, 'Invalid key derivation settings.')
      return { type: 'phrase', salt: b64(u.salt, 64, 'salt'), iterations, wrapped: wrapped(u.wrapped) }
    }
    if (u.type === 'passkey')
      return {
        type: 'passkey',
        credentialId: b64(u.credentialId, 2048, 'credential id'),
        prfSalt: b64(u.prfSalt, 64, 'salt'),
        hkdfSalt: b64(u.hkdfSalt, 64, 'salt'),
        label: str(u.label, 100, 'label'),
        createdAt: str(u.createdAt, 40, 'date'),
        wrapped: wrapped(u.wrapped),
      }
    throw new HttpError(400, 'Invalid unlock method.')
  })
  if (unlocks.filter((u) => u.type === 'phrase').length !== 1) throw new HttpError(400, 'A diary needs exactly one secret phrase.')
  return { version: 1, createdAt: str(v.createdAt, 40, 'date'), unlocks }
}

function recordList(v: unknown): { id: string; sealed: Sealed }[] {
  if (!Array.isArray(v) || v.length > MAX_ITEMS_PER_USER) throw new HttpError(400, 'Invalid records.')
  const seen = new Set<string>()
  return v.map((r) => {
    if (!isObj(r)) throw new HttpError(400, 'Invalid record.')
    const id = itemId(r.id)
    if (seen.has(id)) throw new HttpError(400, 'Duplicate record id.')
    seen.add(id)
    return { id, sealed: sealed(r.sealed) }
  })
}

function blobMap(v: unknown): { id: string; sealed: Sealed }[] {
  if (v === undefined) return []
  if (!isObj(v) || Object.keys(v).length > 50) throw new HttpError(400, 'Invalid settings.')
  return Object.entries(v).map(([id, s]) => ({ id: itemId(id), sealed: sealed(s) }))
}

/** The browser sends a 32-byte PBKDF2 output, never the password itself. */
function passwordHash(v: unknown): Buffer {
  const s = b64(v, 64, 'password')
  const buf = Buffer.from(s, 'base64')
  if (buf.length !== 32) throw new HttpError(400, 'Invalid password.')
  return buf
}

function username(v: unknown): string {
  if (typeof v !== 'string' || !USERNAME.test(v.trim()))
    throw new HttpError(400, 'Usernames are 3–64 letters, numbers or . _ - @ + (no spaces).')
  return v.trim()
}

// ---- http helpers ------------------------------------------------------------

async function readJson(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared > limit) throw new HttpError(413, 'That’s too large to save.')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) throw new HttpError(413, 'That’s too large to save.')
    chunks.push(chunk as Buffer)
  }
  if (!size) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!isObj(parsed)) throw new Error()
    return parsed
  } catch {
    throw new HttpError(400, 'Invalid JSON.')
  }
}

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string | string[]> = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    ...headers,
  })
  res.end(body === undefined ? undefined : JSON.stringify(body))
}

function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out.set(part.slice(0, i).trim(), part.slice(i + 1).trim())
  }
  return out
}

// ---- the app -------------------------------------------------------------------

export function createApp(opts: AppOptions): Handler {
  const { db, secureCookies, trustProxy = false, allowSignups = true, signupsPerHour = 10, readOnly = false } = opts
  const cookieName = secureCookies ? '__Host-lc_session' : 'lc_session'
  const loginByIp = new AttemptLimiter(30, 15 * 60_000)
  const loginByName = new AttemptLimiter(10, 15 * 60_000)
  const signupByIp = new AttemptLimiter(signupsPerHour, 60 * 60_000)

  const clientIp = (req: IncomingMessage) =>
    (trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || '?'

  const sessionCookie = (token: string, maxAge: number) =>
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`

  async function startSession(res: ServerResponse, userId: string, name: string, status = 200) {
    const token = newSessionToken()
    await db.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))', [
      hashToken(token),
      userId,
      SESSION_DAYS,
    ])
    send(res, status, { username: name }, { 'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86_400) })
  }

  async function currentUser(req: IncomingMessage): Promise<{ id: string; username: string } | null> {
    const token = parseCookies(req.headers.cookie).get(cookieName)
    if (!token || token.length > 100) return null
    const { rows } = await db.query<{ id: string; username: string }>(
      'SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()',
      [hashToken(token)],
    )
    return rows[0] ?? null
  }

  async function requireUser(req: IncomingMessage) {
    const user = await currentUser(req)
    if (!user) throw new HttpError(401, 'Please sign in again.')
    return user
  }

  async function checkQuota(tx: Queryable, userId: string, adding: { sealed: Sealed }[]) {
    const { rows } = await tx.query<{ n: string; bytes: string }>(
      'SELECT count(*) AS n, COALESCE(sum(length(ct)), 0) AS bytes FROM vault_items WHERE user_id = $1',
      [userId],
    )
    const extra = adding.reduce((sum, a) => sum + a.sealed.ct.length, 0)
    if (Number(rows[0].n) + adding.length > MAX_ITEMS_PER_USER || Number(rows[0].bytes) + extra > MAX_BYTES_PER_USER)
      throw new HttpError(413, 'Your diary has reached its storage limit.')
  }

  async function requireVault(tx: Queryable, userId: string, lock = false) {
    const { rows } = await tx.query<{ rev: number }>(`SELECT rev FROM vaults WHERE user_id = $1${lock ? ' FOR UPDATE' : ''}`, [userId])
    if (!rows[0]) throw new HttpError(409, 'There’s no diary in this account yet.')
    return rows[0].rev
  }

  async function insertItems(tx: Queryable, userId: string, kind: 'record' | 'blob', items: { id: string; sealed: Sealed }[], skipExisting: boolean) {
    if (!items.length) return [] as string[]
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO vault_items (user_id, kind, id, iv, ct)
       SELECT $1::uuid, $2::text, * FROM unnest($3::text[], $4::text[], $5::text[])
       ${skipExisting ? 'ON CONFLICT (user_id, kind, id) DO NOTHING' : ''}
       RETURNING id`,
      [userId, kind, items.map((i) => i.id), items.map((i) => i.sealed.iv), items.map((i) => i.sealed.ct)],
    )
    return rows.map((r) => r.id)
  }

  /** Copies everything in the diary into history before a destructive operation. */
  async function archiveAll(tx: Queryable, userId: string, reason: string) {
    await tx.query(
      `INSERT INTO vault_history (user_id, kind, id, payload, reason)
       SELECT user_id, kind, id, jsonb_build_object('iv', iv, 'ct', ct, 'updatedAt', updated_at), $2
       FROM vault_items WHERE user_id = $1`,
      [userId, reason],
    )
    await tx.query(
      `INSERT INTO vault_history (user_id, kind, id, payload, reason)
       SELECT user_id, 'meta', 'vault', jsonb_build_object('meta', meta, 'rev', rev), $2 FROM vaults WHERE user_id = $1`,
      [userId, reason],
    )
  }

  async function putItem(userId: string, kind: 'record' | 'blob', id: string, item: Sealed) {
    await db.transaction(async (tx) => {
      await requireVault(tx, userId)
      const { rows } = await tx.query<{ settled: boolean; len: number }>(
        `SELECT updated_at < now() - ${SETTLED} AS settled, length(ct) AS len FROM vault_items WHERE user_id = $1 AND kind = $2 AND id = $3 FOR UPDATE`,
        [userId, kind, id],
      )
      if (!rows[0]) await checkQuota(tx, userId, [{ sealed: item }])
      if (rows[0]?.settled)
        await tx.query(
          `INSERT INTO vault_history (user_id, kind, id, payload, reason)
           SELECT user_id, kind, id, jsonb_build_object('iv', iv, 'ct', ct, 'updatedAt', updated_at), 'update'
           FROM vault_items WHERE user_id = $1 AND kind = $2 AND id = $3`,
          [userId, kind, id],
        )
      await tx.query(
        `INSERT INTO vault_items (user_id, kind, id, iv, ct) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, kind, id) DO UPDATE SET iv = EXCLUDED.iv, ct = EXCLUDED.ct, updated_at = now()`,
        [userId, kind, id, item.iv, item.ct],
      )
    })
  }

  async function exportVault(userId: string) {
    const vault = await db.query<{ meta: unknown; rev: number }>('SELECT meta, rev FROM vaults WHERE user_id = $1', [userId])
    if (!vault.rows[0]) throw new HttpError(404, 'There’s no diary in this account yet.')
    const items = await db.query<{ kind: string; id: string; iv: string; ct: string }>(
      'SELECT kind, id, iv, ct FROM vault_items WHERE user_id = $1',
      [userId],
    )
    const records = items.rows.filter((r) => r.kind === 'record').map((r) => ({ id: r.id, sealed: { iv: r.iv, ct: r.ct } }))
    const blobs = Object.fromEntries(items.rows.filter((r) => r.kind === 'blob').map((r) => [r.id, { iv: r.iv, ct: r.ct }]))
    return { meta: vault.rows[0].meta, rev: vault.rows[0].rev, records, blobs }
  }

  type Route = (req: IncomingMessage, res: ServerResponse, param: string) => Promise<void>
  const routes: [method: string, pattern: RegExp, handler: Route][] = [
    ['GET', /^\/api\/health$/, async (_req, res) => {
      await db.query('SELECT 1')
      send(res, 200, { ok: true })
    }],

    // ---- accounts ----
    ['GET', /^\/api\/auth\/session$/, async (req, res) => {
      const user = await requireUser(req)
      send(res, 200, { username: user.username })
    }],

    ['POST', /^\/api\/auth\/register$/, async (req, res) => {
      if (!allowSignups) throw new HttpError(403, 'New accounts aren’t being created on this site.')
      if (!signupByIp.allow(clientIp(req))) throw new HttpError(429, 'Too many new accounts from here. Please try again later.')
      const body = await readJson(req, SMALL_BODY)
      const name = username(body.username)
      const hash = await hashPassword(passwordHash(body.password))
      const id = randomUUID()
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT ((lower(username))) DO NOTHING RETURNING id`,
        [id, name, hash],
      )
      if (!rows[0]) throw new HttpError(409, 'That username is taken. Try another?')
      await startSession(res, id, name, 201)
    }],

    ['POST', /^\/api\/auth\/login$/, async (req, res) => {
      const body = await readJson(req, SMALL_BODY)
      const name = username(body.username)
      const password = passwordHash(body.password)
      const nameKey = name.toLowerCase()
      if (!loginByIp.allow(clientIp(req)) || !loginByName.allow(nameKey))
        throw new HttpError(429, 'Too many tries. Please wait a few minutes and try again.')
      const { rows } = await db.query<{ id: string; username: string; password_hash: string }>(
        'SELECT id, username, password_hash FROM users WHERE lower(username) = lower($1)',
        [name],
      )
      const user = rows[0]
      if (!user) {
        await burnPasswordCheck(password)
        throw new HttpError(401, 'That username and password don’t match.')
      }
      if (!(await verifyPassword(password, user.password_hash))) throw new HttpError(401, 'That username and password don’t match.')
      loginByName.reset(nameKey)
      await startSession(res, user.id, user.username)
    }],

    ['POST', /^\/api\/auth\/logout$/, async (req, res) => {
      const token = parseCookies(req.headers.cookie).get(cookieName)
      if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
      send(res, 204, undefined, { 'Set-Cookie': sessionCookie('', 0) })
    }],

    ['POST', /^\/api\/auth\/password$/, async (req, res) => {
      const user = await requireUser(req)
      const body = await readJson(req, SMALL_BODY)
      const current = passwordHash(body.current)
      const next = passwordHash(body.next)
      if (!loginByName.allow(user.username.toLowerCase())) throw new HttpError(429, 'Too many tries. Please wait a few minutes.')
      const { rows } = await db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [user.id])
      if (!(await verifyPassword(current, rows[0].password_hash))) throw new HttpError(403, 'Your current password didn’t match.')
      // The username is part of the browser-side salt, so it can't change here; only the password does.
      await db.transaction(async (tx) => {
        await tx.query('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, await hashPassword(next)])
        await tx.query('DELETE FROM sessions WHERE user_id = $1', [user.id]) // sign out everywhere else
      })
      await startSession(res, user.id, user.username)
    }],

    // ---- the diary ----
    ['GET', /^\/api\/vault$/, async (req, res) => {
      const user = await requireUser(req)
      const { rows } = await db.query<{ meta: unknown; rev: number }>('SELECT meta, rev FROM vaults WHERE user_id = $1', [user.id])
      if (!rows[0]) return send(res, 404, { error: 'There’s no diary in this account yet.' })
      send(res, 200, { meta: rows[0].meta, rev: rows[0].rev })
    }],

    // Creates the diary (rev 0) or updates its key metadata. `rev` must match, so a stale device can't
    // overwrite a change made elsewhere (e.g. a passkey added on another device).
    ['PUT', /^\/api\/vault\/meta$/, async (req, res) => {
      const user = await requireUser(req)
      const body = await readJson(req, SMALL_BODY)
      const meta = vaultMeta(body.meta)
      const rev = body.rev
      if (typeof rev !== 'number' || !Number.isInteger(rev) || rev < 0) throw new HttpError(400, 'Invalid revision.')
      const next = await db.transaction(async (tx) => {
        if (rev === 0) {
          const { rows } = await tx.query<{ rev: number }>(
            'INSERT INTO vaults (user_id, meta) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING RETURNING rev',
            [user.id, JSON.stringify(meta)],
          )
          return rows[0]?.rev
        }
        await tx.query(
          `INSERT INTO vault_history (user_id, kind, id, payload, reason)
           SELECT user_id, 'meta', 'vault', jsonb_build_object('meta', meta, 'rev', rev), 'meta-change' FROM vaults WHERE user_id = $1 AND rev = $2`,
          [user.id, rev],
        )
        const { rows } = await tx.query<{ rev: number }>(
          'UPDATE vaults SET meta = $2, rev = rev + 1, updated_at = now() WHERE user_id = $1 AND rev = $3 RETURNING rev',
          [user.id, JSON.stringify(meta), rev],
        )
        return rows[0]?.rev
      })
      if (next === undefined) throw new HttpError(409, 'Your diary was changed somewhere else. Please try again.')
      send(res, 200, { rev: next })
    }],

    ['GET', /^\/api\/vault\/records$/, async (req, res) => {
      const user = await requireUser(req)
      const { rows } = await db.query<{ id: string; iv: string; ct: string }>(
        "SELECT id, iv, ct FROM vault_items WHERE user_id = $1 AND kind = 'record'",
        [user.id],
      )
      send(res, 200, { records: rows.map((r) => ({ id: r.id, sealed: { iv: r.iv, ct: r.ct } })) })
    }],

    ['PUT', /^\/api\/vault\/(records|blobs)\/([^/]+)$/, async (req, res, param) => {
      const user = await requireUser(req)
      const [collection, rawId] = param.split('/')
      const id = itemId(decodeURIComponent(rawId))
      const body = await readJson(req, ITEM_BODY)
      await putItem(user.id, collection === 'records' ? 'record' : 'blob', id, sealed(body))
      send(res, 204)
    }],

    ['GET', /^\/api\/vault\/blobs\/([^/]+)$/, async (req, res, param) => {
      const user = await requireUser(req)
      const id = itemId(decodeURIComponent(param))
      const { rows } = await db.query<{ iv: string; ct: string }>(
        "SELECT iv, ct FROM vault_items WHERE user_id = $1 AND kind = 'blob' AND id = $2",
        [user.id, id],
      )
      if (!rows[0]) return send(res, 404, { error: 'Not found.' })
      send(res, 200, { sealed: { iv: rows[0].iv, ct: rows[0].ct } })
    }],

    ['DELETE', /^\/api\/vault\/records\/([^/]+)$/, async (req, res, param) => {
      const user = await requireUser(req)
      const id = itemId(decodeURIComponent(param))
      await db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO vault_history (user_id, kind, id, payload, reason)
           SELECT user_id, kind, id, jsonb_build_object('iv', iv, 'ct', ct, 'updatedAt', updated_at), 'delete'
           FROM vault_items WHERE user_id = $1 AND kind = 'record' AND id = $2`,
          [user.id, id],
        )
        await tx.query("DELETE FROM vault_items WHERE user_id = $1 AND kind = 'record' AND id = $2", [user.id, id])
      })
      send(res, 204) // idempotent, so a retried delete is harmless
    }],

    ['GET', /^\/api\/vault\/export$/, async (req, res) => {
      const user = await requireUser(req)
      send(res, 200, await exportVault(user.id))
    }],

    // Migration, case 1: brings a whole diary (exactly as it was encrypted on a device) into an account
    // that has none yet. Refuses if the account already has a diary, so it can never overwrite one.
    ['POST', /^\/api\/vault\/import$/, async (req, res) => {
      const user = await requireUser(req)
      const body = await readJson(req, BULK_BODY)
      const meta = vaultMeta(body.meta)
      const records = recordList(body.records)
      const blobs = blobMap(body.blobs)
      const rev = await db.transaction(async (tx) => {
        const { rows } = await tx.query<{ rev: number }>(
          'INSERT INTO vaults (user_id, meta) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING RETURNING rev',
          [user.id, JSON.stringify(meta)],
        )
        if (!rows[0]) throw new HttpError(409, 'This account already has a diary.')
        await checkQuota(tx, user.id, [...records, ...blobs])
        await insertItems(tx, user.id, 'record', records, false)
        await insertItems(tx, user.id, 'blob', blobs, false)
        return rows[0].rev
      })
      send(res, 201, { rev, records: records.length })
    }],

    // Migration, case 2: adds entries (already re-encrypted with this account's key by the browser)
    // to an existing diary. Entries whose id already exists are skipped — never overwritten.
    ['POST', /^\/api\/vault\/records\/merge$/, async (req, res) => {
      const user = await requireUser(req)
      const body = await readJson(req, BULK_BODY)
      const records = recordList(body.records)
      const added = await db.transaction(async (tx) => {
        await requireVault(tx, user.id, true)
        await checkQuota(tx, user.id, records)
        return insertItems(tx, user.id, 'record', records, true)
      })
      send(res, 200, { added: added.length, skipped: records.length - added.length })
    }],

    // Restoring a backup: replaces the diary, but only after archiving all of the current one.
    ['POST', /^\/api\/vault\/replace$/, async (req, res) => {
      const user = await requireUser(req)
      const body = await readJson(req, BULK_BODY)
      const meta = vaultMeta(body.meta)
      const records = recordList(body.records)
      const blobs = blobMap(body.blobs)
      const expected = body.rev
      if (typeof expected !== 'number' || !Number.isInteger(expected) || expected < 0) throw new HttpError(400, 'Invalid revision.')
      const rev = await db.transaction(async (tx) => {
        const { rows } = await tx.query<{ rev: number }>('SELECT rev FROM vaults WHERE user_id = $1 FOR UPDATE', [user.id])
        const current = rows[0]?.rev ?? 0
        if (current !== expected) throw new HttpError(409, 'Your diary was changed somewhere else. Please try again.')
        if (rows[0]) {
          await archiveAll(tx, user.id, 'replace')
          await tx.query('DELETE FROM vault_items WHERE user_id = $1', [user.id])
          await tx.query('UPDATE vaults SET meta = $2, rev = rev + 1, updated_at = now() WHERE user_id = $1', [user.id, JSON.stringify(meta)])
        } else {
          await tx.query('INSERT INTO vaults (user_id, meta) VALUES ($1, $2)', [user.id, JSON.stringify(meta)])
        }
        await checkQuota(tx, user.id, [...records, ...blobs])
        await insertItems(tx, user.id, 'record', records, false)
        await insertItems(tx, user.id, 'blob', blobs, false)
        return current + 1
      })
      send(res, 200, { rev })
    }],

    // "Erase my diary" / "start over". Explicit and confirmed in the UI; still archived for recovery.
    ['DELETE', /^\/api\/vault$/, async (req, res) => {
      const user = await requireUser(req)
      const body = await readJson(req, SMALL_BODY)
      if (body.confirm !== 'erase') throw new HttpError(400, 'Erasing needs confirmation.')
      await db.transaction(async (tx) => {
        await archiveAll(tx, user.id, 'erase')
        await tx.query('DELETE FROM vaults WHERE user_id = $1', [user.id])
      })
      send(res, 204)
    }],
  ]

  return async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://x')
    const method = req.method ?? 'GET'
    try {
      // CSRF: a custom header can't be sent cross-site without a CORS preflight, which this server never
      // approves. Together with SameSite=Strict cookies, other sites can't act on a signed-in session.
      // (/api/health is exempt so the hosting platform's health checks work; it reads nothing.)
      if (req.headers['x-requested-with'] !== 'little-corner' && url.pathname !== '/api/health') throw new HttpError(403, 'Forbidden.')
      const origin = req.headers.origin
      if (origin && origin !== 'null' && URL.parse(origin)?.host !== req.headers.host) throw new HttpError(403, 'Forbidden.')

      if (readOnly && method !== 'GET')
        throw new HttpError(503, 'Your diary is moving to its new home for a few minutes. Anything you write is kept safe on this device and saved as soon as it’s done.')

      const matching = routes.filter(([, pattern]) => pattern.test(url.pathname))
      if (!matching.length) throw new HttpError(404, 'Not found.')
      const route = matching.find(([m]) => m === method)
      if (!route) throw new HttpError(405, 'Method not allowed.')
      const m = url.pathname.match(route[1])!
      await route[2](req, res, m.slice(1).join('/'))
    } catch (err) {
      if (err instanceof HttpError) {
        if (!res.headersSent) send(res, err.status, { error: err.message })
        return
      }
      // Log only the error's kind — never request data, SQL parameters or messages that may echo values.
      console.error(`[api] ${method} ${routePattern(url.pathname)} failed: ${(err as { code?: string }).code ?? (err as Error)?.name ?? 'error'}`)
      if (!res.headersSent) send(res, 500, { error: 'Something went wrong on the server. Your words are still safe on this device; I’ll try again.' })
    }
  }
}

/** A path safe for logs: ids are replaced with ":id". */
export function routePattern(path: string): string {
  return path.replace(/^(\/api\/vault\/(?:records|blobs)\/)(?!merge$)[^/]+$/, '$1:id')
}

/** Drops expired sessions and history older than the retention window. Run periodically. */
export async function housekeeping(db: Db, historyDays = 30): Promise<void> {
  await db.query('DELETE FROM sessions WHERE expires_at < now()')
  await db.query("DELETE FROM vault_history WHERE archived_at < now() - make_interval(days => $1)", [historyDays])
}
