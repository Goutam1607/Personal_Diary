import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LockScene } from '../components/scene/LockScene'
import { Dialog } from '../components/ui/Dialog'
import { Icon } from '../components/ui/Icon'
import { PrivacyWhisper } from '../components/PrivacyPromise'
import { PasskeyError } from '../lib/passkey'
import { WrongSecretError } from '../lib/vault'
import { useSettings } from '../state/settings'
import { useVault } from '../state/vault'

export function LockScreen() {
  const { passkeys, unlockWithPhrase, unlockWithPasskey, storage, reload, account, signOut } = useVault()
  const { settings } = useSettings()
  const hasPasskey = passkeys.length > 0
  const [usePhrase, setUsePhrase] = useState(!hasPasskey)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [forgotOpen, setForgotOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (usePhrase) inputRef.current?.focus()
  }, [usePhrase])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!phrase || busy) return
    setBusy(true)
    setError('')
    try {
      await unlockWithPhrase(phrase)
    } catch (err) {
      setError(err instanceof WrongSecretError ? 'Hmm, that’s not quite it. Take your time and try again.' : (err as Error).message)
      setBusy(false)
      setPhrase('')
      inputRef.current?.focus()
    }
  }

  const withPasskey = async () => {
    setBusy(true)
    setError('')
    for (const p of passkeys) {
      try {
        await unlockWithPasskey(p)
        return
      } catch (err) {
        if (err instanceof PasskeyError && err.kind === 'cancelled') {
          setError('No worries. You can try again, or use your secret phrase.')
          break
        }
        setError(err instanceof PasskeyError ? err.message : 'That passkey didn’t open the diary. You can use your secret phrase instead.')
      }
    }
    setBusy(false)
  }

  return (
    <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="page-enter flex w-full max-w-md flex-col items-center text-center">
        <LockScene kind={settings.companion} />
        <p className="mt-6 text-3xl" aria-hidden="true">
          🔐
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">This little world is private.</h1>
        <p className="hand mt-2 text-2xl text-muted">Your little corner is waiting for you. 🤍</p>

        <div className="mt-8 w-full">
          {hasPasskey && !usePhrase && (
            <div className="flex flex-col items-center gap-3">
              <button type="button" className="btn btn-primary w-full max-w-xs text-lg" onClick={withPasskey} disabled={busy} autoFocus>
                <Icon name="fingerprint" size={22} />
                {busy ? 'Waiting for your device…' : 'Unlock with passkey'}
              </button>
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setUsePhrase(true)}>
                Use my secret phrase instead
              </button>
            </div>
          )}

          {usePhrase && (
            <form onSubmit={submit} className="flex w-full flex-col items-center gap-3">
              <label htmlFor="phrase" className="text-sm text-muted">
                Your secret phrase
              </label>
              <input
                ref={inputRef}
                id="phrase"
                type="password"
                autoComplete="current-password"
                className="field max-w-xs text-center text-lg"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? 'unlock-error' : undefined}
                disabled={busy}
              />
              <button type="submit" className="btn btn-primary w-full max-w-xs text-lg" disabled={busy || !phrase}>
                <Icon name="key" />
                {busy ? 'Opening gently…' : 'Open my diary'}
              </button>
              {hasPasskey && (
                <button type="button" className="btn btn-ghost text-sm" onClick={() => setUsePhrase(false)}>
                  Use my passkey instead
                </button>
              )}
            </form>
          )}

          <p id="unlock-error" role="alert" className="mt-4 min-h-6 text-sm text-muted">
            {error}
          </p>
        </div>

        <PrivacyWhisper className="mt-2">Encrypted on your device. Only your phrase or passkey opens it.</PrivacyWhisper>

        <button type="button" className="mt-4 text-sm text-muted underline decoration-dotted underline-offset-4 hover:text-ink" onClick={() => setForgotOpen(true)}>
          Forgot your phrase?
        </button>
        {account && (
          <p className="mt-3 text-xs text-muted">
            Signed in as {account} ·{' '}
            <button type="button" className="underline decoration-dotted underline-offset-4 hover:text-ink" onClick={() => void signOut().catch(() => {})}>
              Sign out
            </button>
          </p>
        )}
      </div>

      <ForgotDialog
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        onErase={async () => {
          await storage.destroy()
          setForgotOpen(false)
          await reload()
        }}
      />
    </main>
  )
}

function ForgotDialog({ open, onClose, onErase }: { open: boolean; onClose: () => void; onErase: () => Promise<void> }) {
  const [confirm, setConfirm] = useState('')
  const ready = confirm.trim().toLowerCase() === 'start over'
  return (
    <Dialog open={open} onClose={onClose} title="If you’ve forgotten your phrase">
      <div className="space-y-3 text-[0.95rem] leading-relaxed">
        <p>
          Your diary is encrypted with your phrase (and your passkey, if you added one). Nobody else has the key — not this website, not
          anyone. That’s what keeps it private, but it also means it can’t be recovered without them.
        </p>
        <p>
          If you have a passkey set up, try that first. Starting over erases the diary in your account. If you have a backup, you can
          restore it afterwards.
        </p>
        <p className="text-muted">
          To erase this diary and begin again, type <strong className="text-ink">start over</strong> below.
        </p>
        <input className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Type start over to confirm" />
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Keep my diary
          </button>
          <button type="button" className="btn btn-primary" disabled={!ready} onClick={onErase}>
            Erase and start over
          </button>
        </div>
      </div>
    </Dialog>
  )
}
