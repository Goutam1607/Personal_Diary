import { toBase64 } from './crypto'
import type { ApiClient } from './api'

/**
 * Accounts decide *whose* encrypted diary the server hands out. They are separate from the secret
 * phrase, which is what actually decrypts the diary and never leaves this device.
 *
 * The account password is never sent as-is: the browser sends PBKDF2-SHA-256(password, 600k rounds,
 * salted with the username), and the server hashes that again with scrypt. So even if someone
 * reuses their secret phrase as their account password, the server still never sees the phrase.
 */

export const MIN_PASSWORD_LENGTH = 8
const ITERATIONS = 600_000
const enc = new TextEncoder()

export async function accountKey(username: string, password: string): Promise<string> {
  const material = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`little-corner/account/v1:${username.trim().toLowerCase()}`), iterations: ITERATIONS },
    material,
    256,
  )
  return toBase64(bits)
}

export interface Account {
  username: string
}

export async function currentAccount(client: ApiClient): Promise<Account | null> {
  try {
    return await client.get<Account>('/api/auth/session')
  } catch (err) {
    if ((err as { status?: number }).status === 401) return null
    throw err
  }
}

export async function signUp(client: ApiClient, username: string, password: string): Promise<Account> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Please use at least ${MIN_PASSWORD_LENGTH} characters.`)
  return client.post<Account>('/api/auth/register', { username: username.trim(), password: await accountKey(username, password) })
}

export async function signIn(client: ApiClient, username: string, password: string): Promise<Account> {
  return client.post<Account>('/api/auth/login', { username: username.trim(), password: await accountKey(username, password) })
}

export async function signOut(client: ApiClient): Promise<void> {
  await client.post('/api/auth/logout')
}

export async function changeAccountPassword(client: ApiClient, username: string, current: string, next: string): Promise<void> {
  if (next.length < MIN_PASSWORD_LENGTH) throw new Error(`Please use at least ${MIN_PASSWORD_LENGTH} characters.`)
  const [c, n] = await Promise.all([accountKey(username, current), accountKey(username, next)])
  await client.post('/api/auth/password', { current: c, next: n })
}
