import { fromBase64, randomBytes, toBase64 } from './crypto'

/**
 * Passkeys via WebAuthn with the PRF extension.
 *
 * Why PRF matters: this diary has no server, so a plain passkey "login" would only be a
 * screen that JavaScript decides to hide — anyone with access to the browser's storage
 * could skip it. The PRF extension instead makes your authenticator (Windows Hello,
 * Touch ID, a phone, a security key) compute a secret that never leaves it unless you
 * verify yourself. That secret is what decrypts the diary, so the passkey is a real key,
 * not just a door sign.
 *
 * If the device/browser doesn't support PRF, we say so honestly and you use your secret phrase.
 */

export function passkeysAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && window.isSecureContext
}

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!passkeysAvailable()) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export class PasskeyError extends Error {
  constructor(
    message: string,
    readonly kind: 'cancelled' | 'no-prf' | 'unsupported' | 'failed',
  ) {
    super(message)
  }
}

interface PrfResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } }
}

function prfExtension(salt: Uint8Array<ArrayBuffer>) {
  return { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs
}

function mapError(err: unknown): PasskeyError {
  if (err instanceof PasskeyError) return err
  const name = (err as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'AbortError')
    return new PasskeyError('The passkey prompt was closed.', 'cancelled')
  if (name === 'NotSupportedError') return new PasskeyError('This device does not support passkeys.', 'unsupported')
  return new PasskeyError((err as Error)?.message || 'Something went wrong with the passkey.', 'failed')
}

export interface NewPasskey {
  credentialId: string
  prfSalt: string
  prfOutput: ArrayBuffer
}

/** Creates a passkey and immediately obtains its PRF secret. */
export async function createPasskey(displayName: string): Promise<NewPasskey> {
  if (!passkeysAvailable()) throw new PasskeyError('Passkeys need a secure (https) page.', 'unsupported')
  const prfSalt = randomBytes(32)
  let cred: PublicKeyCredential
  try {
    cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'My little corner' },
        user: { id: randomBytes(16), name: 'little-corner-diary', displayName: displayName || 'My diary' },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        timeout: 120_000,
        extensions: prfExtension(prfSalt),
      },
    })) as PublicKeyCredential
  } catch (err) {
    throw mapError(err)
  }
  if (!cred) throw new PasskeyError('No passkey was created.', 'failed')

  const credentialId = toBase64(cred.rawId)
  const ext = cred.getClientExtensionResults() as PrfResults
  if (ext.prf?.enabled === false) {
    throw new PasskeyError("This passkey can't produce an encryption key (no PRF support).", 'no-prf')
  }
  // Some authenticators return the PRF output at creation; most need one assertion.
  let prfOutput = ext.prf?.results?.first
  if (!prfOutput) prfOutput = await evaluatePrf(credentialId, toBase64(prfSalt))
  return { credentialId, prfSalt: toBase64(prfSalt), prfOutput }
}

/** Asks the authenticator (with user verification) for the PRF secret for this credential. */
export async function evaluatePrf(credentialId: string, prfSalt: string): Promise<ArrayBuffer> {
  if (!passkeysAvailable()) throw new PasskeyError('Passkeys need a secure (https) page.', 'unsupported')
  let assertion: PublicKeyCredential
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: fromBase64(credentialId) }],
        userVerification: 'required',
        timeout: 120_000,
        extensions: prfExtension(fromBase64(prfSalt)),
      },
    })) as PublicKeyCredential
  } catch (err) {
    throw mapError(err)
  }
  const out = (assertion?.getClientExtensionResults() as PrfResults)?.prf?.results?.first
  if (!out) throw new PasskeyError("This passkey can't produce an encryption key (no PRF support).", 'no-prf')
  return out
}
