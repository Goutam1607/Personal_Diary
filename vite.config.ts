/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * A strict Content-Security-Policy for production builds.
 * The diary never talks to any server: no fonts, analytics or APIs are fetched
 * from anywhere else, so `connect-src 'self'` is all it needs.
 * (Skipped in dev because Vite's hot-reload needs inline scripts and websockets.)
 */
function contentSecurityPolicy(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
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

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  // Listen on IPv4 loopback so both http://localhost:5173 and http://127.0.0.1:5173 connect
  // (by default Node on Windows may bind only to IPv6 ::1). Still only reachable from this computer.
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
