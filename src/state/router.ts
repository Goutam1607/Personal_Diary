import { useEffect, useState } from 'react'

/**
 * A tiny hash router. Hash routes keep the diary working from any static host
 * (or straight from disk) without server configuration.
 */
export interface Route {
  path: string[]
  params: URLSearchParams
  /** Increments on every navigation; used to give each fresh page its own identity. */
  nonce: number
}

let nonce = 0
function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [p, q = ''] = raw.split('?')
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(q), nonce: nonce++ }
}

/**
 * When a brand-new page is first saved, its address changes from `write` to `write/<id>`.
 * This remembers which on-screen editor owns that id so it isn't torn down mid-sentence.
 */
export const pageAliases = new Map<string, string>()

export function useRoute(): Route {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function navigate(to: string, { replace = false } = {}) {
  const hash = '#/' + to.replace(/^\/+/, '')
  if (replace) window.history.replaceState(null, '', hash)
  else window.location.hash = hash
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'))
  window.scrollTo({ top: 0 })
}

export function href(to: string): string {
  return '#/' + to.replace(/^\/+/, '')
}
