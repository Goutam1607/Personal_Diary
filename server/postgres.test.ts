import 'fake-indexeddb/auto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiClient } from '../src/lib/api.ts'
import { signIn, signUp } from '../src/lib/account.ts'
import { Outbox, RemoteStorage } from '../src/lib/remoteStorage.ts'
import type { Entry } from '../src/lib/types.ts'
import { createVault, deleteEntry, exportBackup, loadEntries, loadPrivateSettings, saveEntry, savePrivateSettings, unlockWithPhrase } from '../src/lib/vault.ts'
import { createApp } from './app.ts'
import { PassThrough, Readable } from 'node:stream'
import { restoreBackup, writeBackup } from './backup-database.ts'
import { checkNothingMissing, copyDatabase, fingerprint, verifyDatabases } from './copy-database.ts'
import { TABLES, migrate, postgresDb, securityWarnings, type Db } from './db.ts'

/**
 * The production path, for real: node-postgres talking to an actual PostgreSQL server over TLS,
 * and the Render → Supabase move. "render" plays the old database; "supabase" is set up like a
 * Supabase project (anon/authenticated roles with Supabase's default grants on new tables), and the
 * server only accepts TLS with a certificate from our own test CA — like Supabase's own root CA.
 */

const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage

const has = (cmd: string, args: string[]) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const available = has('openssl', ['version'])

const PORT = 55000 + Math.floor(Math.random() * 1000)
let dir: string
let pg: { stop(): Promise<void> }
let ca: string
let impostorCa: string
const url = (db: string, host = 'localhost') => `postgresql://postgres:test-pw@${host}:${PORT}/${db}`

function makeCerts(at: string) {
  const ssl = (...args: string[]) => execFileSync('openssl', args, { cwd: at, stdio: 'ignore' })
  ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '2', '-subj', '/CN=Test Root CA')
  ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'evil.key', '-out', 'evil.crt', '-days', '2', '-subj', '/CN=Impostor CA')
  ssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'server.key', '-out', 'server.csr', '-subj', '/CN=localhost')
  writeFileSync(join(at, 'san.cnf'), 'subjectAltName=DNS:localhost\n')
  ssl('x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.crt', '-days', '2', '-extfile', 'san.cnf')
}

beforeAll(async () => {
  if (!available) return
  dir = mkdtempSync(join(tmpdir(), 'lc-pg-'))
  makeCerts(dir)
  ca = readFileSync(join(dir, 'ca.crt'), 'utf8')
  impostorCa = readFileSync(join(dir, 'evil.crt'), 'utf8')
  const { default: EmbeddedPostgres } = await import('embedded-postgres')
  const p = (f: string) => join(dir, f).replace(/\\/g, '/')
  const server = new EmbeddedPostgres({
    databaseDir: p('data'),
    port: PORT,
    user: 'postgres',
    password: 'test-pw',
    persistent: false,
    postgresFlags: ['-c', 'ssl=on', '-c', `ssl_cert_file=${p('server.crt')}`, '-c', `ssl_key_file=${p('server.key')}`],
    onLog: () => {},
    onError: () => {},
  })
  await server.initialise()
  await server.start()
  pg = server
  const admin = await postgresDb(url('postgres'), { caCert: ca, poolMax: 1 })
  await admin.query('CREATE DATABASE render_db')
  await admin.query('CREATE DATABASE supabase_db')
  await admin.query('CREATE ROLE anon NOLOGIN')
  await admin.query('CREATE ROLE authenticated NOLOGIN')
  await admin.close()
  // Supabase's default: tables later created in public are granted to anon/authenticated.
  const supa = await postgresDb(url('supabase_db'), { caCert: ca, poolMax: 1 })
  await supa.query('GRANT USAGE ON SCHEMA public TO anon, authenticated')
  await supa.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated')
  await supa.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated')
  await supa.close()
}, 180_000)

afterAll(async () => {
  await pg?.stop()
  if (dir) rmSync(dir, { recursive: true, force: true })
}, 60_000)

/** An app server on top of a database, like one deploy of the web service. */
async function deploy(db: Db, opts: { readOnly?: boolean } = {}) {
  await migrate(db)
  const api = createApp({ db, secureCookies: false, signupsPerHour: 1000, ...opts })
  const server: Server = createServer((req, res) => void api(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, stop: () => new Promise((r) => server.close(r)) }
}

let n = 0
/** One browser: cookie jar + outbox. `point()` lets it follow the site to a new deploy (same origin in real life). */
function browser(base: string) {
  let cookie = ''
  let current = base
  const f: typeof fetch = async (input, init) => {
    const res = await fetch(String(input).replace(/^http:\/\/[^/]+/, current), {
      ...init,
      headers: { ...(init?.headers as Record<string, string>), ...(cookie ? { Cookie: cookie } : {}) },
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    return res
  }
  const client = new ApiClient({ base: 'http://site', fetch: f })
  const remote = new RemoteStorage(client, new Outbox(`pg-outbox-${n++}`))
  return { client, remote, point: (b: string) => (current = b) }
}

const entry = (body: string, over: Partial<Entry> = {}): Entry => ({
  id: crypto.randomUUID(),
  kind: 'entry',
  date: '2026-09-29',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  mood: 'happy',
  tags: ['Grateful'],
  body,
  favorite: false,
  ...over,
})

describe.skipIf(!available)('real PostgreSQL over verified TLS', () => {
  it('connects only with the right CA, and only to the right host name', async () => {
    const good = await postgresDb(url('postgres'), { caCert: ca, poolMax: 1 })
    const { rows } = await good.query<{ ssl: boolean }>('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()')
    expect(rows[0].ssl).toBe(true)
    await good.close()

    // an sslmode in the URL can't switch verification off when a CA is configured
    const downgraded = await postgresDb(`${url('postgres')}?sslmode=disable`, { caCert: ca, poolMax: 1 })
    expect((await downgraded.query<{ ssl: boolean }>('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()')).rows[0].ssl).toBe(true)
    await downgraded.close()

    const impostor = await postgresDb(url('postgres'), { caCert: impostorCa, poolMax: 1 })
    await expect(impostor.query('SELECT 1')).rejects.toThrow()
    await impostor.close().catch(() => {})

    const wrongHost = await postgresDb(url('postgres', '127.0.0.1'), { caCert: ca, poolMax: 1 })
    await expect(wrongHost.query('SELECT 1')).rejects.toThrow(/IP|altnames|match/i)
    await wrongHost.close().catch(() => {})

    // a CA pasted with literal \n (as some dashboards store multi-line values) still works
    const flattened = await postgresDb(url('postgres'), { caCert: ca.replace(/\n/g, '\\n'), poolMax: 1 })
    expect((await flattened.query<{ one: number }>('SELECT 1 AS one')).rows[0].one).toBe(1)
    await flattened.close()
  })

  it('moves a live diary from "Render" to "Supabase" without decrypting or losing anything', async () => {
    // ---- life on the old database ----
    const render = await postgresDb(url('render_db'), { caCert: ca })
    let site = await deploy(render)
    const alice = browser(site.base)
    alice.remote.account = (await signUp(alice.client, 'alice', 'alice account pw')).username
    const aliceKey = await createVault(alice.remote, 'alice secret phrase')
    const keep = entry('the lake was golden today', { favorite: true })
    const gone = entry('a page alice deletes')
    await saveEntry(alice.remote, aliceKey, keep)
    await saveEntry(alice.remote, aliceKey, gone)
    await saveEntry(alice.remote, aliceKey, entry('a sad day', { mood: 'sad', tags: ['Lonely'] }))
    await deleteEntry(alice.remote, gone.id) // leaves an archived copy in vault_history
    await savePrivateSettings(alice.remote, aliceKey, { name: 'Alice', customTags: ['Homesick'] })

    const bob = browser(site.base)
    bob.remote.account = (await signUp(bob.client, 'bob', 'bob account pw')).username
    const bobKey = await createVault(bob.remote, 'bob secret phrase')
    await saveEntry(bob.remote, bobKey, entry('bob’s private thoughts'))

    // ---- maintenance: the old site goes read-only; writes wait in the browser's outbox ----
    await site.stop()
    site = await deploy(render, { readOnly: true })
    alice.point(site.base)
    expect((await loadEntries(alice.remote, aliceKey)).length).toBe(2) // reads still work
    const duringMove = entry('written while the diary was moving')
    await saveEntry(alice.remote, aliceKey, duringMove) // resolves: kept in the outbox, not lost
    expect(await alice.remote.isPending('record', duringMove.id)).toBe(true)

    // ---- the copy ----
    const before = await Promise.all(TABLES.map((t) => fingerprint(render, t)))
    const supabase = await postgresDb(url('supabase_db'), { caCert: ca })
    const lines: string[] = []
    const report = await copyDatabase(render, supabase, (l) => lines.push(l))
    expect(report.find((r) => r.table === 'users')?.rows).toBe(2)
    expect(report.find((r) => r.table === 'vault_history')!.rows).toBeGreaterThan(0)
    expect(await Promise.all(TABLES.map((t) => fingerprint(render, t)))).toEqual(before) // source untouched
    expect(await verifyDatabases(render, supabase)).toBe(true)
    // the copy's output names tables and counts, never contents
    expect(lines.join('\n')).not.toMatch(/lake|alice|bob|scrypt/i)

    // no plaintext anywhere in the new database
    const dump = JSON.stringify((await supabase.query('SELECT * FROM vault_items')).rows) + JSON.stringify((await supabase.query('SELECT * FROM vaults')).rows)
    expect(dump).not.toMatch(/golden|private thoughts|Homesick|secret phrase/)

    // a second copy can't overwrite it
    await expect(copyDatabase(render, supabase)).rejects.toThrow(/already has data/)

    // ---- Supabase's Data API roles can't touch the tables ----
    expect(await securityWarnings(supabase)).toEqual([])
    for (const role of ['anon', 'authenticated']) {
      await expect(
        supabase.transaction(async (tx) => {
          await tx.query(`SET LOCAL ROLE ${role}`)
          await tx.query('SELECT * FROM vault_items')
        }),
      ).rejects.toThrow(/permission denied/)
    }
    // …and the check notices if a grant ever comes back
    await supabase.query('GRANT SELECT ON users TO anon')
    expect(await securityWarnings(supabase)).toEqual(['role anon has privileges on table users'])
    await supabase.query('REVOKE SELECT ON users FROM anon')

    // ---- switch the site to Supabase: same session cookie, outbox syncs ----
    await site.stop()
    site = await deploy(supabase)
    alice.point(site.base)
    expect(await alice.remote.sync()).toEqual([])
    expect(await alice.remote.pendingCount()).toBe(0)
    const inSupabase = await supabase.query('SELECT 1 FROM vault_items WHERE id = $1', [duringMove.id])
    expect(inSupabase.rows).toHaveLength(1)

    // ---- a new device signs in (password hash copied) and reads everything ----
    const phone = browser(site.base)
    await expect(signIn(phone.client, 'alice', 'wrong password!')).rejects.toThrow()
    phone.remote.account = (await signIn(phone.client, 'alice', 'alice account pw')).username
    await expect(unlockWithPhrase(phone.remote, 'wrong phrase here')).rejects.toThrow()
    const k = await unlockWithPhrase(phone.remote, 'alice secret phrase')
    const pages = await loadEntries(phone.remote, k)
    expect(pages.map((e) => e.body).sort()).toEqual(['a sad day', 'the lake was golden today', 'written while the diary was moving'])
    expect(pages.find((e) => e.id === keep.id)).toMatchObject({ favorite: true, mood: 'happy' })
    expect((await loadPrivateSettings(phone.remote, k)).customTags).toEqual(['Homesick'])

    // create, edit, delete on the new database
    const fresh = entry('first page in the new home')
    await saveEntry(phone.remote, k, fresh)
    await saveEntry(phone.remote, k, { ...fresh, body: 'first page in the new home, edited' })
    await deleteEntry(phone.remote, keep.id)
    expect((await loadEntries(phone.remote, k)).map((e) => e.body)).toContain('first page in the new home, edited')

    // encrypted backup still works and stays encrypted
    const backup = await exportBackup(phone.remote)
    expect(JSON.stringify(backup)).not.toContain('new home')

    // ---- Bob only ever sees Bob's diary ----
    const bobPhone = browser(site.base)
    bobPhone.remote.account = (await signIn(bobPhone.client, 'bob', 'bob account pw')).username
    const bk = await unlockWithPhrase(bobPhone.remote, 'bob secret phrase')
    expect((await loadEntries(bobPhone.remote, bk)).map((e) => e.body)).toEqual(['bob’s private thoughts'])
    await expect(unlockWithPhrase(bobPhone.remote, 'alice secret phrase')).rejects.toThrow()
    expect((await bobPhone.client.get<{ records: unknown[] }>('/api/vault/records')).records).toHaveLength(1)

    // ---- before deleting the old database: nothing from it is missing (deletes are archived) ----
    expect(await checkNothingMissing(render, supabase)).toBe(0)
    await supabase.query("DELETE FROM vault_items WHERE id = (SELECT id FROM vault_items WHERE kind = 'record' AND user_id = (SELECT id FROM users WHERE username = 'bob'))")
    expect(await checkNothingMissing(render, supabase)).toBe(1) // a real loss is caught

    // ---- a redeploy / restart: new process, new pool, same database ----
    await site.stop()
    await supabase.close()
    const again = await postgresDb(url('supabase_db'), { caCert: ca })
    site = await deploy(again)
    const laptop = browser(site.base)
    laptop.remote.account = (await signIn(laptop.client, 'alice', 'alice account pw')).username
    const k2 = await unlockWithPhrase(laptop.remote, 'alice secret phrase')
    expect((await loadEntries(laptop.remote, k2)).map((e) => e.body)).toContain('first page in the new home, edited')

    await site.stop()
    await Promise.all([again.close(), render.close()])
  })

  it('backs up over TLS, restores exactly, and refuses a role that would silently see no rows', async () => {
    const admin = await postgresDb(url('postgres'), { caCert: ca, poolMax: 1 })
    await admin.query('CREATE DATABASE backup_src')
    await admin.query('CREATE DATABASE backup_dst')
    await admin.query("CREATE ROLE backup_reader LOGIN PASSWORD 'reader-pw'")
    await admin.close()

    const src = await postgresDb(url('backup_src'), { caCert: ca })
    const site = await deploy(src)
    const b = browser(site.base)
    b.remote.account = (await signUp(b.client, 'carol', 'carol account pw')).username
    const key = await createVault(b.remote, 'carol secret phrase')
    for (let i = 0; i < 3; i++) await saveEntry(b.remote, key, entry(`carol page ${i}`))
    await site.stop()

    const out = new PassThrough()
    const chunks: Buffer[] = []
    out.on('data', (c: Buffer) => chunks.push(c))
    await writeBackup(src, out)
    const dst = await postgresDb(url('backup_dst'), { caCert: ca })
    await restoreBackup(Readable.from([Buffer.concat(chunks)]), dst)
    for (const t of TABLES) expect(await fingerprint(dst, t)).toEqual(await fingerprint(src, t))

    // A role that can SELECT but neither owns the tables nor bypasses RLS gets 0 rows, silently.
    await src.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO backup_reader')
    const reader = await postgresDb(`postgresql://backup_reader:reader-pw@localhost:${PORT}/backup_src`, { caCert: ca, poolMax: 1 })
    expect((await reader.query('SELECT * FROM vault_items')).rows).toHaveLength(0) // the trap
    await expect(writeBackup(reader, new PassThrough())).rejects.toThrow(/would not see every row/)
    await expect(copyDatabase(reader, await postgresDb(url('postgres'), { caCert: ca, poolMax: 1 }))).rejects.toThrow(/would not see every row/)
    await Promise.all([reader.close(), src.close(), dst.close()])
  })
})
