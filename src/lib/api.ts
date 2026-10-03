/** Talks to this site's own /api. Same origin only, so the session cookie (HttpOnly) rides along automatically. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** The server couldn't be reached at all (offline, or the server is restarting). */
export class OfflineError extends Error {
  constructor() {
    super('I can’t reach your diary right now. Check your connection and try again — nothing you’ve written is lost.')
  }
}

export interface ApiClientOptions {
  /** Prefix for every path; empty in the browser (same origin). */
  base?: string
  fetch?: typeof fetch
}

export class ApiClient {
  private readonly base: string
  private readonly fetcher: typeof fetch
  /** Called whenever the server says the session is gone, so the app can ask to sign in again. */
  onUnauthorized: (() => void) | null = null

  constructor({ base = '', fetch: f }: ApiClientOptions = {}) {
    this.base = base
    this.fetcher = f ?? ((input, init) => fetch(input, init))
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await this.fetcher(this.base + path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          // Required by the server on every call: a cross-site page can't add it without a CORS preflight.
          'X-Requested-With': 'little-corner',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new OfflineError()
    }
    if (res.status === 204) return undefined as T
    let data: { error?: string } | undefined
    try {
      data = await res.json()
    } catch {
      data = undefined
    }
    if (!res.ok) {
      if (res.status === 401) this.onUnauthorized?.()
      if (res.status >= 502 && res.status <= 504) throw new OfflineError()
      throw new ApiError(res.status, data?.error ?? `The server couldn’t do that (${res.status}).`)
    }
    return data as T
  }

  get = <T>(path: string) => this.request<T>('GET', path)
  post = <T>(path: string, body?: unknown) => this.request<T>('POST', path, body ?? {})
  put = <T>(path: string, body: unknown) => this.request<T>('PUT', path, body)
  delete = <T>(path: string, body?: unknown) => this.request<T>('DELETE', path, body)
}
