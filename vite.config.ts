/// <reference types="vitest/config" />
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * A strict Content-Security-Policy for production builds.
 * The diary talks only to its own server (same origin, /api): no fonts, analytics or APIs are fetched
 * from anywhere else. The one exception is the optional Google Drive backup, which uploads the
 * (encrypted) backup file to www.googleapis.com.
 * (Skipped in dev because Vite's hot-reload needs inline scripts and websockets.)
 */
function contentSecurityPolicy(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://www.googleapis.com",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      )
    },
  }
}

/**
 * Runs the diary's API (server/app.ts) inside `vite` and `vite preview`, so `npm start` is still one
 * command. Uses DATABASE_URL if set, otherwise a local PGlite database in ./.data/pglite
 * (LC_DEV_DB=memory for a throwaway one, as the browser tests do). Production uses server/index.ts.
 */
function diaryApi(): Plugin {
  const mount = async (middlewares: Connect.Server, onClose: (fn: () => void) => void) => {
    if (process.env.VITEST) return // unit tests start their own databases
    const { createApp } = await import('./server/app.ts')
    const { migrate, pgliteDb, postgresDb } = await import('./server/db.ts')
    const db = process.env.DATABASE_URL
      ? await postgresDb(process.env.DATABASE_URL, { caCert: process.env.DATABASE_CA_CERT })
      : await pgliteDb(process.env.LC_DEV_DB === 'memory' ? undefined : './.data/pglite')
    await migrate(db)
    const api = createApp({ db, secureCookies: false, signupsPerHour: 1000, readOnly: process.env.MAINTENANCE_MODE === 'read-only' })
    middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => (req.url?.startsWith('/api/') ? void api(req, res) : next()))
    onClose(() => void db.close())
  }
  return {
    name: 'diary-api',
    configureServer: (server) => mount(server.middlewares, (fn) => server.httpServer?.once('close', fn)),
    configurePreviewServer: (server) => mount(server.middlewares, (fn) => server.httpServer.once('close', fn)),
  }
}

/**
 * Vite copies every VITE_* variable into the JavaScript sent to browsers. Fail the build if one of
 * them looks like a database connection string or a Supabase secret/service-role key, so a misnamed
 * variable can never publish database credentials.
 */
function noSecretsInBundle(): Plugin {
  const SECRET = /postgres(ql)?:\/\/|service_role|sb_secret_|BEGIN [A-Z ]*PRIVATE KEY/i
  return {
    name: 'no-secrets-in-bundle',
    configResolved(config) {
      for (const [key, value] of Object.entries(config.env))
        if (key.startsWith('VITE_') && SECRET.test(String(value)))
          throw new Error(`${key} looks like a database credential or secret key. VITE_ variables are public; keep it server-side (e.g. DATABASE_URL).`)
    },
  }
}

export default defineConfig({
  plugins: [noSecretsInBundle(), react(), tailwindcss(), contentSecurityPolicy(), diaryApi()],
  // Listen on IPv4 loopback so both http://localhost:5173 and http://127.0.0.1:5173 connect
  // (by default Node on Windows may bind only to IPv6 ::1). Still only reachable from this computer.
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    testTimeout: 30_000,
  },
})
