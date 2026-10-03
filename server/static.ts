import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'

/** Security headers for every page (these used to be set by Render's static-site config). */
export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://www.googleapis.com; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
}

/** Serves the built app from `root`. Only GET/HEAD, only files inside `root`. */
export function serveStatic(root: string) {
  const base = resolve(root)
  return async function (req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }
    let path: string
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    } catch {
      res.writeHead(400).end()
      return
    }
    if (path.endsWith('/')) path += 'index.html'
    const file = resolve(join(base, path))
    if (path.includes('\0') || (file !== base && !file.startsWith(base + sep))) {
      res.writeHead(404).end()
      return
    }
    try {
      const info = await stat(file)
      if (!info.isFile()) throw new Error('not a file')
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': info.size,
        // File names in /assets change on every build, so they can be cached forever; everything else is revalidated.
        'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      })
      if (req.method === 'HEAD') res.end()
      else createReadStream(file).pipe(res)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
    }
  }
}
