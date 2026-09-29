/**
 * All cryptography for the diary, built only on the browser's native Web Crypto API.
 *
 * Model:
 *  - One random 256-bit AES-GCM "vault key" encrypts every entry.
 *  - The vault key is never stored in the clear. It is stored *wrapped* (encrypted) by
 *    one or more "unlock keys":
 *      • a key derived from your secret phrase (PBKDF2-SHA-256, 600k iterations)
 *      • a key derived from your passkey's PRF output (HKDF-SHA-256), when supported
 *  - After unlocking, the vault key lives only in memory as a non-extractable CryptoKey.
 */

export const PBKDF2_ITERATIONS = 600_000
const enc = new TextEncoder()
const dec = new TextDecoder()

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length))
}

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** A fresh vault key. Extractable only so that it can be wrapped once at setup time. */
export function generateVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function deriveKeyFromPhrase(
  phrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', enc.encode(phrase.normalize('NFC')), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

/** Turns a passkey PRF output (32 secret bytes that only the authenticator can produce) into a wrapping key. */
export async function deriveKeyFromPrf(prfOutput: ArrayBuffer, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('little-corner vault key wrap v1') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  )
}

export interface WrappedKey {
  iv: string
  data: string
}

export async function wrapVaultKey(vaultKey: CryptoKey, wrappingKey: CryptoKey): Promise<WrappedKey> {
  const iv = randomBytes(12)
  const data = await crypto.subtle.wrapKey('raw', vaultKey, wrappingKey, { name: 'AES-GCM', iv })
  return { iv: toBase64(iv), data: toBase64(data) }
}

/**
 * Unwraps into a NON-extractable key: once unlocked, even code running on the page
 * cannot read the raw key bytes out — it can only ask the browser to encrypt/decrypt.
 * Throws if the wrapping key is wrong (AES-GCM authentication fails).
 */
export async function unwrapVaultKey(wrapped: WrappedKey, wrappingKey: CryptoKey, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    fromBase64(wrapped.data),
    wrappingKey,
    { name: 'AES-GCM', iv: fromBase64(wrapped.iv) },
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  )
}

export interface Sealed {
  iv: string
  ct: string
}

/** Encrypts any JSON-serialisable value. `aad` binds the ciphertext to its record id so records can't be swapped. */
export async function seal(key: CryptoKey, value: unknown, aad?: string): Promise<Sealed> {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, ...(aad ? { additionalData: enc.encode(aad) } : {}) },
    key,
    enc.encode(JSON.stringify(value)),
  )
  return { iv: toBase64(iv), ct: toBase64(ct) }
}

export async function open<T>(key: CryptoKey, sealed: Sealed, aad?: string): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.iv), ...(aad ? { additionalData: enc.encode(aad) } : {}) },
    key,
    fromBase64(sealed.ct),
  )
  return JSON.parse(dec.decode(pt)) as T
}
