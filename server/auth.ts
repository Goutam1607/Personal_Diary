import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

/**
 * Account passwords.
 *
 * The browser never sends the password itself: it sends PBKDF2-SHA-256(password, 600k rounds,
 * salted with the username) — see src/lib/account.ts. So even someone who reuses their diary phrase
 * as their account password never hands the phrase to this server. Here that 32-byte value is
 * hashed again with scrypt and a random salt before it is stored.
 */

const N = 2 ** 15
const R = 8
const P = 1
const KEYLEN = 32
const MAXMEM = 64 * 1024 * 1024

function scrypt(password: Buffer, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, KEYLEN, opts, (err, key) => (err ? reject(err) : resolve(key))))
}

export async function hashPassword(password: Buffer): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, { N, r: R, p: P, maxmem: MAXMEM })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(password: Buffer, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$')
  if (algo !== 'scrypt' || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** Spends the same time as a real check, so "no such user" can't be told apart from "wrong password". */
let dummy: Promise<string> | null = null
export async function burnPasswordCheck(password: Buffer): Promise<void> {
  dummy ??= hashPassword(randomBytes(32))
  await verifyPassword(password, await dummy)
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

/**
 * A small in-memory limiter for sign-in attempts. Enough for a single instance; if the app is ever
 * scaled to several instances, move this to the database or Redis.
 */
export class AttemptLimiter {
  private readonly hits = new Map<string, number[]>()
  private readonly max: number
  private readonly windowMs: number
  constructor(max: number, windowMs: number) {
    this.max = max
    this.windowMs = windowMs
  }

  /** Records an attempt; returns false when the key has used up its attempts for the window. */
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (recent.length >= this.max) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > 10_000) this.prune(now)
    return true
  }

  reset(key: string) {
    this.hits.delete(key)
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.every((t) => now - t >= this.windowMs)) this.hits.delete(k)
  }
}
