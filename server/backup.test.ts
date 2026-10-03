import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { PassThrough, Readable } from 'node:stream'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { restoreBackup, writeBackup } from './backup-database.ts'
import { fingerprint } from './copy-database.ts'
import { TABLES, migrate, pgliteDb, type Db } from './db.ts'

let source: Db
let server: Server
let base: string

beforeAll(async () => {
  source = await pgliteDb()
  await migrate(source)
  const api = createApp({ db: source, secureCookies: false, signupsPerHour: 1000 })
  server = createServer((req, res) => void api(req, res))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  // Some life in the database: two accounts, diaries, pages, a deletion (→ history).
  for (const name of ['alice', 'bob']) {
    let cookie = ''
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(base + path, {
        method,
        headers: { 'X-Requested-With': 'little-corner', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      cookie = res.headers.get('set-cookie')?.split(';')[0] ?? cookie
      return res.status
    }
    await call('POST', '/api/auth/register', { username: name, password: Buffer.alloc(32, name).toString('base64') })
    await call('PUT', '/api/vault/meta', {
      rev: 0,
      meta: { version: 1, createdAt: '2026-01-01T00:00:00.000Z', unlocks: [{ type: 'phrase', salt: 'c2FsdA==', iterations: 600000, wrapped: { iv: 'AAAAAAAAAAAAAAAA', data: 'd3JhcA==' } }] },
    })
    for (let i = 0; i < 230; i++) await call('PUT', `/api/vault/records/${name}-${i}`, { iv: 'AAAAAAAAAAAAAAAA', ct: Buffer.from(`${name} page ${i}`).toString('base64') })
    await call('DELETE', `/api/vault/records/${name}-0`)
  }
}, 120_000)

afterAll(async () => {
  server.close()
  await source.close()
})

async function backupBytes(): Promise<Buffer> {
  const out = new PassThrough()
  const chunks: Buffer[] = []
  out.on('data', (c: Buffer) => chunks.push(c))
  await writeBackup(source, out)
  return Buffer.concat(chunks)
}

const stream = (b: Buffer) => Readable.from([b])

async function isEmpty(db: Db) {
  for (const t of TABLES) if ((await db.query(`SELECT 1 FROM ${t} LIMIT 1`)).rows.length) return false
  return true
}

describe('database backups', () => {
  it('restores into an empty database exactly as it was', async () => {
    const bytes = await backupBytes()
    const target = await pgliteDb()
    await restoreBackup(stream(bytes), target)
    for (const t of TABLES) expect(await fingerprint(target, t), t).toEqual(await fingerprint(source, t))
    expect((await target.query("SELECT 1 FROM vault_history WHERE reason = 'delete'")).rows).toHaveLength(2)
    // The restored database keeps working for the app: sequences continue after the restored history.
    await target.query("INSERT INTO vault_history (user_id, kind, id, payload, reason) SELECT id, 'record', 'x', '{}', 'test' FROM users LIMIT 1")
    await target.close()
  })

  it('refuses a tampered backup and commits nothing', async () => {
    const lines = gunzipSync(await backupBytes()).toString('utf8').split('\n')
    const i = lines.findIndex((l) => l.startsWith('{"table":"vault_items"'))
    // flip one base64 character inside one stored page
    const original = lines[i]
    lines[i] = lines[i].replace(/"ct": ?"([A-Za-z0-9+/])/, (m, c: string) => m.slice(0, -1) + (c === 'A' ? 'B' : 'A'))
    expect(lines[i]).not.toBe(original)
    const target = await pgliteDb()
    await expect(restoreBackup(stream(gzipSync(lines.join('\n'))), target)).rejects.toThrow(/doesn't match the backup/)
    expect(await isEmpty(target)).toBe(true)
    await target.close()
  })

  it('refuses a cut-off backup', async () => {
    const lines = gunzipSync(await backupBytes()).toString('utf8').trimEnd().split('\n')
    const target = await pgliteDb()
    await expect(restoreBackup(stream(gzipSync(lines.slice(0, -1).join('\n'))), target)).rejects.toThrow(/incomplete/)
    expect(await isEmpty(target)).toBe(true)
    await target.close()
  })

  it('refuses something that is not a backup', async () => {
    const target = await pgliteDb()
    await expect(restoreBackup(stream(gzipSync('{"app":"something-else"}\n')), target)).rejects.toThrow(/isn’t a little-corner/)
    await target.close()
  })

  it('never restores over existing data', async () => {
    const bytes = await backupBytes()
    const target = await pgliteDb()
    await restoreBackup(stream(bytes), target)
    await expect(restoreBackup(stream(bytes), target)).rejects.toThrow(/already has data/)
    await target.close()
  })
})
