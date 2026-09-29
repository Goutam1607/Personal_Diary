import { useEffect, useState, type FormEvent } from 'react'
import { Icon } from './ui/Icon'
import { PasskeyError, passkeysAvailable, platformAuthenticatorAvailable } from '../lib/passkey'
import { addPasskey, WrongSecretError } from '../lib/vault'
import { useVault } from '../state/vault'

interface Props {
  /** Known during first setup; otherwise we ask for it (it's needed to add a new key). */
  phrase?: string
  onDone: () => void | Promise<void>
  /** First-time wording */
  intro?: boolean
}

function deviceLabel(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad/.test(ua)) return 'iPhone / iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows Hello'
  if (/Mac OS/.test(ua)) return 'Mac'
  return 'This device'
}

export function PasskeySetup({ phrase: knownPhrase, onDone, intro }: Props) {
  const { storage, refreshPasskeys } = useVault()
  const [phrase, setPhrase] = useState(knownPhrase ?? '')
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'no-prf' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [platform, setPlatform] = useState<boolean | null>(null)
  const supported = passkeysAvailable()

  useEffect(() => {
    platformAuthenticatorAvailable().then(setPlatform)
  }, [])

  const add = async (e?: FormEvent) => {
    e?.preventDefault()
    setState('busy')
    setMessage('')
    try {
      await addPasskey(storage, phrase, deviceLabel())
      await refreshPasskeys()
      setState('done')
    } catch (err) {
      if (err instanceof WrongSecretError) {
        setState('error')
        setMessage('That phrase didn’t match. Try once more?')
      } else if (err instanceof PasskeyError && err.kind === 'no-prf') {
        setState('no-prf')
      } else if (err instanceof PasskeyError && err.kind === 'cancelled') {
        setState('idle')
        setMessage('That’s okay — nothing was changed.')
      } else {
        setState('error')
        setMessage((err as Error).message)
      }
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Icon name="fingerprint" size={28} className="text-accent" />
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {state === 'done' ? 'Your passkey is ready 🤍' : intro ? 'One more thing: a passkey?' : 'Add a passkey'}
        </h2>
      </div>

      {state === 'done' ? (
        <p className="mt-3 leading-relaxed text-muted">
          Next time, you can open your diary with your fingerprint, face, device PIN or security key. Keep your secret phrase somewhere
          safe too — it’s your way back in if this device is ever lost.
        </p>
      ) : state === 'no-prf' ? (
        <div className="mt-3 space-y-2 leading-relaxed text-muted">
          <p>
            Your device made a passkey, but it can’t produce the kind of secret key needed to <em>encrypt</em> your diary (a feature
            called “PRF”). Using it anyway would only be a pretend lock, so I didn’t turn it on.
          </p>
          <p>
            Your diary is still fully protected by your secret phrase. Passkeys with this feature work in recent Chrome, Edge and Safari
            with Google Password Manager, iCloud Keychain, Android phones, Windows Hello on up-to-date Windows 11, and most security
            keys. You can try again anytime from Settings. (You may want to delete the unused passkey from your device’s passkey list.)
          </p>
        </div>
      ) : (
        <>
          <p className="mt-3 leading-relaxed text-muted">
            A passkey lets your device unlock the diary with a fingerprint, face or PIN instead of typing your phrase. The passkey
            produces a secret that’s used as a real encryption key — it isn’t just a pretty login screen.
          </p>
          {!supported && (
            <p className="mt-3 rounded-2xl bg-accent-soft/70 p-3 text-sm">
              This browser can’t use passkeys here{!window.isSecureContext ? ' (the page needs to be opened over https)' : ''}. Your
              secret phrase keeps everything protected.
            </p>
          )}
          {supported && platform === false && (
            <p className="mt-3 text-sm text-muted">This device has no built-in fingerprint/face unlock, but a phone or security key can work.</p>
          )}
          {supported && (
            <form onSubmit={add} className="mt-5 space-y-3">
              {!knownPhrase && (
                <div>
                  <label htmlFor="pk-phrase" className="block text-sm font-semibold">
                    Your secret phrase (needed once, to add a new key)
                  </label>
                  <input
                    id="pk-phrase"
                    type="password"
                    className="field mt-1"
                    autoComplete="current-password"
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value)}
                  />
                </div>
              )}
              <button className="btn btn-primary" disabled={state === 'busy' || !phrase}>
                <Icon name="fingerprint" />
                {state === 'busy' ? 'Follow your device’s prompt…' : 'Set up a passkey'}
              </button>
            </form>
          )}
        </>
      )}

      {message && (
        <p role="alert" className="mt-3 text-sm text-muted">
          {message}
        </p>
      )}

      <div className="mt-6 flex justify-end">
        <button type="button" className={state === 'done' || state === 'no-prf' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => onDone()}>
          {state === 'done' || state === 'no-prf' ? (intro ? 'Open my little corner' : 'Done') : intro ? 'Maybe later' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
