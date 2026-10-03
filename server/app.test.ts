import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp, housekeeping, routePattern } from './app.ts'
import { migrate, pgliteDb, type Db } from './db.ts'

let db: Db
let server: Server
let base: string

beforeAll(async () => {
  db = await pgliteDb()
  await migrate(db)
  await migrate(db) // idempotent
  const api = createApp({ db, secureCookies: false, signupsPerHour: 1000 })
  server = createServer((req, res) => void api(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}, 60_000)

afterAll(async () => {
  server.close()
  await db.close()
})

const pw = (seed: string) => Buffer.alloc(32, seed).toString('base64')
let userN = 0

/** A tiny client with its own cookie jar, like one browser. */
function client() {
  let cookie = ''
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'X-Requested-With': 'little-corner', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : undefined, setCookie: set }
  }
  return {
    call,
    async signUp(name = `user${userN++}`) {
      const r = await call('POST', '/api/auth/register', { username: name, password: pw('a') })
      expect(r.status).toBe(201)
      return name
    },
  }
}

const sealed = (n: number) => ({ iv: 'AAAAAAAAAAAAAAAA', ct: Buffer.from(`ciphertext ${n}`).toString('base64') })
const meta = (salt = 'c2FsdHNhbHQ=') => ({
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  unlocks: [{ type: 'phrase', salt, iterations: 600000, wrapped: { iv: 'AAAAAAAAAAAAAAAA', data: 'd3JhcHBlZA==' } }],
})

async function withVault() {
  const c = client()
  await c.signUp()
  expect((await c.call('PUT', '/api/vault/meta', { meta: meta(), rev: 0 })).status).toBe(200)
  return c
}

describe('accounts', () => {
  it('signs up, signs in, signs out', async () => {
    const c = client()
    const name = await c.signUp()
    expect((await c.call('GET', '/api/auth/session')).body).toEqual({ username: name })
    expect((await c.call('POST', '/api/auth/logout')).status).toBe(204)
    expect((await c.call('GET', '/api/auth/session')).status).toBe(401)

    const wrong = await c.call('POST', '/api/auth/login', { username: name, password: pw('b') })
    expect(wrong.status).toBe(401)
    const unknown = await c.call('POST', '/api/auth/login', { username: 'nobody-here', password: pw('a') })
    expect(unknown.status).toBe(401)
    expect(unknown.body.error).toBe(wrong.body.error) // no hint about which usernames exist

    const ok = await c.call('POST', '/api/auth/login', { username: name.toUpperCase(), password: pw('a') })
    expect(ok.status).toBe(200)
    expect(ok.setCookie).toMatch(/HttpOnly/)
    expect(ok.setCookie).toMatch(/SameSite=Strict/)
  })

  it('stores only hashes of passwords and session tokens', async () => {
    const c = client()
    const name = await c.signUp()
    const { rows } = await db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE username = $1', [name])
    expect(rows[0].password_hash).toMatch(/^scrypt\$/)
    expect(rows[0].password_hash).not.toContain(pw('a'))
    const sessions = await db.query<{ token_hash: string }>('SELECT token_hash FROM sessions')
    expect(sessions.rows.length).toBeGreaterThan(0)
  })

  it('refuses duplicate usernames regardless of case', async () => {
    const c = client()
    const name = await c.signUp()
    const again = await client().call('POST', '/api/auth/register', { username: name.toUpperCase(), password: pw('a') })
    expect(again.status).toBe(409)
  })

  it('only accepts a browser-side password hash, never a raw password', async () => {
    const r = await client().call('POST', '/api/auth/register', { username: 'rawpw', password: 'hunter2hunter2' })
    expect(r.status).toBe(400)
  })

  it('changing the password signs out other sessions', async () => {
    const a = client()
    const name = await a.signUp()
    const b = client()
    await b.call('POST', '/api/auth/login', { username: name, password: pw('a') })
    expect((await a.call('POST', '/api/auth/password', { current: pw('x'), next: pw('n') })).status).toBe(403)
    expect((await a.call('POST', '/api/auth/password', { current: pw('a'), next: pw('n') })).status).toBe(200)
    expect((await a.call('GET', '/api/auth/session')).status).toBe(200)
    expect((await b.call('GET', '/api/auth/session')).status).toBe(401)
    expect((await b.call('POST', '/api/auth/login', { username: name, password: pw('n') })).status).toBe(200)
  })

  it('rate-limits repeated wrong passwords for a username', async () => {
    const c = client()
    const name = await c.signUp()
    let last = 0
    for (let i = 0; i < 12; i++) last = (await client().call('POST', '/api/auth/login', { username: name, password: pw('z') })).status
    expect(last).toBe(429)
  })
})

describe('protection', () => {
  it('requires a session for every diary route', async () => {
    const anon = client()
    for (const [m, p] of [
      ['GET', '/api/vault'],
      ['GET', '/api/vault/records'],
      ['GET', '/api/vault/export'],
      ['PUT', '/api/vault/records/abc'],
      ['DELETE', '/api/vault/records/abc'],
      ['GET', '/api/vault/blobs/settings'],
    ])
      expect((await anon.call(m, p, m === 'PUT' ? sealed(1) : undefined)).status, `${m} ${p}`).toBe(401)
  })

  it('rejects requests without the CSRF header or from another origin', async () => {
    const c = await withVault()
    expect((await c.call('GET', '/api/vault', undefined, { 'X-Requested-With': '' })).status).toBe(403)
    expect((await c.call('GET', '/api/vault', undefined, { Origin: 'https://evil.example' })).status).toBe(403)
  })

  it('keeps every user to their own diary, even with the same entry ids', async () => {
    const alice = await withVault()
    const bob = await withVault()
    await alice.call('PUT', '/api/vault/records/shared-id', sealed(1))
    await bob.call('PUT', '/api/vault/records/shared-id', sealed(2))
    await bob.call('DELETE', '/api/vault/records/shared-id')
    const a = await alice.call('GET', '/api/vault/records')
    expect(a.body.records).toEqual([{ id: 'shared-id', sealed: sealed(1) }])
    expect((await bob.call('GET', '/api/vault/records')).body.records).toEqual([])
  })

  it('ignores any user id the client tries to supply', async () => {
    const alice = await withVault()
    const bob = await withVault()
    const { rows } = await db.query<{ user_id: string }>('SELECT user_id FROM vaults LIMIT 1')
    await bob.call('PUT', '/api/vault/records/x?user_id=' + rows[0].user_id, { ...sealed(9), user_id: rows[0].user_id })
    expect((await alice.call('GET', '/api/vault/records')).body.records).toEqual([])
  })

  it('validates ids, ciphertext and metadata', async () => {
    const c = await withVault()
    expect((await c.call('PUT', '/api/vault/records/bad%20id', sealed(1))).status).toBe(400)
    expect((await c.call('PUT', "/api/vault/records/x'%3B--", sealed(1))).status).toBe(400)
    expect((await c.call('PUT', '/api/vault/records/ok', { iv: 'not base64!', ct: 'AA==' })).status).toBe(400)
    expect((await c.call('PUT', '/api/vault/meta', { meta: { version: 1, unlocks: [] }, rev: 1 })).status).toBe(400)
    // a diary must always keep its phrase unlock
    const noPhrase = { ...meta(), unlocks: [] }
    expect((await c.call('PUT', '/api/vault/meta', { meta: noPhrase, rev: 1 })).status).toBe(400)
  })

  it('logs routes without ids', () => {
    expect(routePattern('/api/vault/records/123e4567-e89b')).toBe('/api/vault/records/:id')
    expect(routePattern('/api/vault/records/merge')).toBe('/api/vault/records/merge')
  })
})

describe('the diary', () => {
  it('creates a diary once and never overwrites it with a second create', async () => {
    const c = await withVault()
    const again = await c.call('PUT', '/api/vault/meta', { meta: meta('b3RoZXI='), rev: 0 })
    expect(again.status).toBe(409)
    expect((await c.call('GET', '/api/vault')).body.meta.unlocks[0].salt).toBe('c2FsdHNhbHQ=')
  })

  it('rejects stale metadata updates', async () => {
    const c = await withVault()
    expect((await c.call('PUT', '/api/vault/meta', { meta: meta('bmV3'), rev: 1 })).body).toEqual({ rev: 2 })
    expect((await c.call('PUT', '/api/vault/meta', { meta: meta('b2xk'), rev: 1 })).status).toBe(409)
    const history = await db.query("SELECT 1 FROM vault_history WHERE kind = 'meta' AND reason = 'meta-change'")
    expect(history.rows.length).toBeGreaterThan(0)
  })

  it('saves, lists, updates and deletes encrypted records, archiving deletes', async () => {
    const c = await withVault()
    await c.call('PUT', '/api/vault/records/e1', sealed(1))
    await c.call('PUT', '/api/vault/records/e1', sealed(2))
    await c.call('PUT', '/api/vault/blobs/settings', sealed(3))
    expect((await c.call('GET', '/api/vault/records')).body.records).toEqual([{ id: 'e1', sealed: sealed(2) }])
    expect((await c.call('GET', '/api/vault/blobs/settings')).body.sealed).toEqual(sealed(3))
    expect((await c.call('GET', '/api/vault/blobs/nope')).status).toBe(404)
    expect((await c.call('DELETE', '/api/vault/records/e1')).status).toBe(204)
    expect((await c.call('DELETE', '/api/vault/records/e1')).status).toBe(204)
    expect((await c.call('GET', '/api/vault/records')).body.records).toEqual([])
    const { rows } = await db.query<{ payload: { ct: string } }>("SELECT payload FROM vault_history WHERE id = 'e1' AND reason = 'delete'")
    expect(rows.map((r) => r.payload.ct)).toContain(sealed(2).ct)
  })

  it('archives a settled version before overwriting it', async () => {
    const c = await withVault()
    await c.call('PUT', '/api/vault/records/old', sealed(1))
    await db.query("UPDATE vault_items SET updated_at = now() - interval '1 hour' WHERE id = 'old'")
    await c.call('PUT', '/api/vault/records/old', sealed(2))
    const { rows } = await db.query<{ payload: { ct: string } }>("SELECT payload FROM vault_history WHERE id = 'old' AND reason = 'update'")
    expect(rows.map((r) => r.payload.ct)).toEqual([sealed(1).ct])
  })

  it('needs a diary before items can be saved', async () => {
    const c = client()
    await c.signUp()
    expect((await c.call('PUT', '/api/vault/records/e1', sealed(1))).status).toBe(409)
    expect((await c.call('GET', '/api/vault')).status).toBe(404)
  })

  it('imports a whole diary only into an empty account', async () => {
    const c = client()
    await c.signUp()
    const body = { meta: meta(), records: [{ id: 'a', sealed: sealed(1) }, { id: 'b', sealed: sealed(2) }], blobs: { settings: sealed(3) } }
    expect((await c.call('POST', '/api/vault/import', body)).status).toBe(201)
    expect((await c.call('POST', '/api/vault/import', { ...body, records: [] })).status).toBe(409)
    const exp = await c.call('GET', '/api/vault/export')
    expect(exp.body.records).toHaveLength(2)
    expect(exp.body.blobs).toEqual({ settings: sealed(3) })
  })

  it('merges entries without ever overwriting existing ones', async () => {
    const c = await withVault()
    await c.call('PUT', '/api/vault/records/keep', sealed(1))
    const r = await c.call('POST', '/api/vault/records/merge', { records: [{ id: 'keep', sealed: sealed(9) }, { id: 'new', sealed: sealed(2) }] })
    expect(r.body).toEqual({ added: 1, skipped: 1 })
    const records = (await c.call('GET', '/api/vault/records')).body.records
    expect(records.find((x: { id: string }) => x.id === 'keep').sealed).toEqual(sealed(1))
  })

  it('replaces (restore) only at the expected revision, archiving the old diary', async () => {
    const c = await withVault()
    await c.call('PUT', '/api/vault/records/before', sealed(1))
    const body = { meta: meta('cmVzdG9yZWQ='), records: [{ id: 'after', sealed: sealed(2) }], blobs: {} }
    expect((await c.call('POST', '/api/vault/replace', { ...body, rev: 5 })).status).toBe(409)
    expect((await c.call('POST', '/api/vault/replace', { ...body, rev: 1 })).status).toBe(200)
    expect((await c.call('GET', '/api/vault/records')).body.records.map((r: { id: string }) => r.id)).toEqual(['after'])
    const { rows } = await db.query("SELECT 1 FROM vault_history WHERE id = 'before' AND reason = 'replace'")
    expect(rows).toHaveLength(1)
  })

  it('erases only with confirmation, keeping an archived copy', async () => {
    const c = await withVault()
    await c.call('PUT', '/api/vault/records/gone', sealed(1))
    expect((await c.call('DELETE', '/api/vault', {})).status).toBe(400)
    expect((await c.call('DELETE', '/api/vault', { confirm: 'erase' })).status).toBe(204)
    expect((await c.call('GET', '/api/vault')).status).toBe(404)
    const { rows } = await db.query("SELECT kind FROM vault_history WHERE reason = 'erase' AND id IN ('gone', 'vault')")
    expect(rows).toHaveLength(2)
  })

  it('housekeeping drops only expired history', async () => {
    await db.query("UPDATE vault_history SET archived_at = now() - interval '40 days' WHERE id = 'gone'")
    await housekeeping(db, 30)
    expect((await db.query("SELECT 1 FROM vault_history WHERE id = 'gone'")).rows).toHaveLength(0)
    expect((await db.query("SELECT 1 FROM vault_history WHERE id = 'before'")).rows).toHaveLength(1)
  })
})
