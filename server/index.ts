import { createServer } from 'node:http'
import { createApp, housekeeping, routePattern } from './app.ts'
import { isPrivateHost, migrate, pgliteDb, postgresDb, securityWarnings, type Db } from './db.ts'
import { SECURITY_HEADERS, serveStatic } from './static.ts'

/**
 * Production entry point: serves the built app (dist/) and the /api routes from one origin.
 *
 *   DATABASE_URL      Postgres connection string (required in production). For Supabase: the
 *                     Session pooler string (port 5432). Server-side only — never a VITE_ variable.
 *   DATABASE_CA_CERT  PEM of the CA that signed the database's TLS certificate (for Supabase, its
 *                     "Supabase Root 2021 CA"). Required for any database reached over the internet.
 *   DB_POOL_MAX       open database connections (default 5)
 *   MAINTENANCE_MODE  "read-only" to refuse changes (503) while the database is being moved
 *   PORT              default 8787
 *   ALLOW_SIGNUPS     "false" to stop new accounts being created
 *   HISTORY_DAYS      how long overwritten/deleted encrypted entries are kept for recovery (default 30)
 */

const production = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT ?? 8787)
const historyDays = Number(process.env.HISTORY_DAYS ?? 30)
const readOnly = process.env.MAINTENANCE_MODE === 'read-only'

async function database(): Promise<Db> {
  const url = process.env.DATABASE_URL
  if (url) {
    const caCert = process.env.DATABASE_CA_CERT
    const ownTls = /[?&]sslmode=verify-full/.test(url) && /[?&]sslrootcert=/.test(url)
    // Never send diary ciphertext, password hashes or session hashes across the internet without a
    // verified TLS connection (encrypted AND certificate-checked, so it can't be intercepted).
    if (production && !isPrivateHost(url) && !caCert && !ownTls)
      throw new Error('DATABASE_URL points to a database on the internet but DATABASE_CA_CERT is not set. Refusing to connect without verified TLS.')
    return postgresDb(url, { caCert, poolMax: Number(process.env.DB_POOL_MAX ?? 5) })
  }
  // A diary on a server's throwaway disk would vanish on the next deploy. Refuse rather than lose words.
  if (production) throw new Error('DATABASE_URL is not set. Refusing to start without a persistent database.')
  console.warn('[server] DATABASE_URL not set: using a local development database in ./.data/pglite')
  return pgliteDb('./.data/pglite')
}

const db = await database()
await migrate(db)
for (const w of await securityWarnings(db)) console.warn(`[security] ${w}`)
if (readOnly) console.warn('[server] MAINTENANCE_MODE=read-only: changes are refused until it is turned off')
else {
  await housekeeping(db, historyDays)
  setInterval(() => housekeeping(db, historyDays).catch((e) => console.error(`[housekeeping] ${e?.code ?? e?.name}`)), 6 * 3600_000).unref()
}

const api = createApp({
  db,
  secureCookies: production,
  trustProxy: production,
  allowSignups: process.env.ALLOW_SIGNUPS !== 'false',
  readOnly,
})
const files = serveStatic('dist')

const server = createServer(async (req, res) => {
  const started = Date.now()
  const path = new URL(req.url ?? '/', 'http://x').pathname

  // Render terminates TLS and forwards plain HTTP; send anyone who arrived over http:// to https://.
  if (production && req.headers['x-forwarded-proto'] === 'http') {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` }).end()
    return
  }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v)
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000')

  res.on('finish', () => {
    // Method, route shape, status and timing only. No bodies, cookies, query strings or ids.
    if (path.startsWith('/api/')) console.log(`${req.method} ${routePattern(path)} ${res.statusCode} ${Date.now() - started}ms`)
  })
  if (path.startsWith('/api/')) await api(req, res)
  else await files(req, res)
})

server.listen(port, () => console.log(`[server] listening on :${port}`))

const shutdown = () => {
  server.close(() => db.close().finally(() => process.exit(0)))
  setTimeout(() => process.exit(0), 10_000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
