import type { BackupFile } from './vault'

/**
 * Google Drive backups.
 *
 * Only the encrypted backup file (exactly what `exportBackup` produces) is ever uploaded, so Google
 * stores ciphertext it can't read. No Google script is loaded into the diary page: we open Google's
 * sign-in in a separate window, it redirects to /oauth-callback.html on this site, and that page
 * hands the short-lived access token back over a same-origin BroadcastChannel.
 *
 * The `drive.file` scope only lets the app see files it created itself — never the rest of your Drive.
 */

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim()
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER = 'my little corner backups'
const CHANNEL = 'little-corner-oauth'
/** Older backups beyond this many are moved to Drive's trash (recoverable there for 30 days). */
const KEEP = 30
const LAST_KEY = 'little-corner:drive-last-backup'

export class DriveAuthError extends Error {}

export interface DriveBackup {
  id: string
  name: string
  createdTime: string
  size?: string
}

let token: { value: string; expires: number } | null = null

export function driveConfigured(): boolean {
  return !!CLIENT_ID && typeof BroadcastChannel !== 'undefined'
}

const DAY = 86_400_000

/** True when there are pages written or changed since the last Drive backup, and it's been a few days. */
export function backupIsDue(updatedAts: string[], last: string | null, now = Date.now()): boolean {
  if (!updatedAts.length) return false
  if (!last) return true
  return now - new Date(last).getTime() >= 3 * DAY && updatedAts.some((u) => new Date(u).getTime() > new Date(last).getTime())
}

export function lastDriveBackup(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

function rememberBackup(at: string) {
  try {
    localStorage.setItem(LAST_KEY, at)
  } catch {
    /* only used for reminders */
  }
}

/** Must be called from a click (it opens a window). Reuses a still-valid token without asking again. */
export function connectDrive(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return Promise.resolve(token.value)
  if (!CLIENT_ID) return Promise.reject(new Error('Google Drive backup isn’t set up for this app.'))

  const state = crypto.randomUUID()
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: `${location.origin}/oauth-callback.html`,
    response_type: 'token',
    scope: SCOPE,
    state,
    include_granted_scopes: 'true',
  })
  const popup = window.open(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 'little-corner-google', 'popup,width=480,height=640')
  if (!popup)
    return Promise.reject(new DriveAuthError('Your browser blocked the Google window. Allow pop-ups for this site and try again.'))

  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(CHANNEL)
    const finish = () => {
      clearTimeout(timer)
      channel.close()
    }
    // We can't rely on popup.closed: Google's pages cut the link between the windows.
    const timer = setTimeout(() => {
      finish()
      reject(new DriveAuthError('Google didn’t answer in time. Please try again.'))
    }, 5 * 60_000)
    channel.onmessage = (ev: MessageEvent<string>) => {
      const res = new URLSearchParams(String(ev.data))
      if (res.get('state') !== state) return
      finish()
      const value = res.get('access_token')
      if (!value) {
        const err = res.get('error')
        return reject(
          new DriveAuthError(
            err === 'access_denied' ? 'Google Drive access wasn’t allowed.' : `Google sign-in failed (${err ?? 'unknown'}).`,
          ),
        )
      }
      token = { value, expires: Date.now() + Number(res.get('expires_in') ?? 3600) * 1000 }
      resolve(value)
    }
  })
}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (!token) throw new DriveAuthError('Not connected to Google Drive.')
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token.value}` } })
  if (res.status === 401) {
    token = null
    throw new DriveAuthError('Your Google session ended. Please connect again.')
  }
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json())?.error?.message ?? ''
    } catch {
      /* ignore */
    }
    throw new Error(`Google Drive said no${detail ? `: ${detail}` : ` (${res.status})`}.`)
  }
  return (init.method === 'DELETE' ? undefined : res.headers.get('content-type')?.includes('json') ? res.json() : res.text()) as Promise<T>
}

const q = (query: string) => encodeURIComponent(query)

async function folderId(): Promise<string> {
  const found = await api<{ files: { id: string }[] }>(
    `${API}/files?q=${q(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)&spaces=drive`,
  )
  if (found.files[0]) return found.files[0].id
  const made = await api<{ id: string }>(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  })
  return made.id
}

function fileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `little-corner-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}.json`
}

export async function listDriveBackups(): Promise<DriveBackup[]> {
  const folder = await folderId()
  const res = await api<{ files: DriveBackup[] }>(
    `${API}/files?q=${q(`'${folder}' in parents and trashed=false`)}&orderBy=createdTime desc&pageSize=100&fields=files(id,name,createdTime,size)`,
  )
  return res.files
}

/** Uploads a new backup file and tidies away the oldest ones beyond KEEP. */
export async function uploadBackup(backup: BackupFile, now = new Date()): Promise<void> {
  const folder = await folderId()
  const boundary = `lc-${crypto.randomUUID()}`
  const metadata = { name: fileName(now), parents: [folder], mimeType: 'application/json', appProperties: { app: 'little-corner' } }
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    JSON.stringify(backup),
    `--${boundary}--`,
    '',
  ].join('\r\n')
  await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  rememberBackup(now.toISOString())

  const all = await listDriveBackups()
  for (const old of all.slice(KEEP)) {
    await api(`${API}/files/${old.id}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    })
  }
}

export async function downloadBackup(id: string): Promise<BackupFile> {
  const text = await api<string | BackupFile>(`${API}/files/${encodeURIComponent(id)}?alt=media`)
  return typeof text === 'string' ? JSON.parse(text) : text
}
