import { useState, type FormEvent } from 'react'
import { LockScene } from '../components/scene/LockScene'
import { Dialog } from '../components/ui/Dialog'
import { Icon } from '../components/ui/Icon'
import { PasskeyError } from '../lib/passkey'
import { WrongSecretError } from '../lib/vault'
import { useSettings } from '../state/settings'
import { useVault } from '../state/vault'

/** The account has no diary yet, and this browser has one from before accounts: offer to move it in. */
export function MigrateScreen() {
  const { legacy, moveLegacy, startFresh } = useVault()
  const { settings } = useSettings()
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [freshOpen, setFreshOpen] = useState(false)
  const passkeys = legacy?.passkeys ?? []
  const pages = legacy?.pages ?? 0

  const fail = (err: unknown) => {
    setBusy(false)
    if (err instanceof WrongSecretError) setError('Hmm, that’s not quite it. It’s the phrase you used to open your diary on this device.')
    else if (err instanceof PasskeyError && err.kind === 'cancelled') setError('No worries. You can try again, or use your secret phrase.')
    else setError((err as Error).message)
  }

  const withPhrase = async (e: FormEvent) => {
    e.preventDefault()
    if (!phrase || busy) return
    setBusy(true)
    setError('')
    try {
      await moveLegacy({ phrase })
    } catch (err) {
      fail(err)
    }
  }

  const withPasskey = async () => {
    setBusy(true)
    setError('')
    for (const passkey of passkeys) {
      try {
        await moveLegacy({ passkey })
        return
      } catch (err) {
        fail(err)
        if (err instanceof PasskeyError && err.kind === 'cancelled') return
      }
    }
  }

  return (
    <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="page-enter flex w-full max-w-md flex-col items-center text-center">
        <LockScene kind={settings.companion} awake />
        <h1 className="font-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">I found your diary on this device.</h1>
        <p className="hand mt-2 text-2xl text-muted">
          {pages} {pages === 1 ? 'page' : 'pages'}, waiting to come along. 🤍
        </p>
        <p className="mt-4 max-w-sm text-[0.95rem] leading-relaxed text-muted">
          Let’s move it into your account, so it’s safe even if this device isn’t. It stays encrypted the whole way. I’ll check that every
          page opens before anything is sent, and the copy on this device stays exactly where it is.
        </p>

        <div className="mt-8 w-full">
          {passkeys.length > 0 && (
            <div className="mb-4 flex flex-col items-center">
              <button type="button" className="btn btn-primary w-full max-w-xs text-lg" onClick={withPasskey} disabled={busy}>
                <Icon name="fingerprint" size={22} />
                {busy ? 'Moving your pages…' : 'Unlock with passkey & move it'}
              </button>
              <p className="mt-3 text-sm text-muted">or use the diary’s secret phrase</p>
            </div>
          )}
          <form onSubmit={withPhrase} className="flex w-full flex-col items-center gap-3">
            <label htmlFor="legacy-phrase" className="text-sm text-muted">
              Your diary’s secret phrase
            </label>
            <input
              id="legacy-phrase"
              type="password"
              autoComplete="current-password"
              className="field max-w-xs text-center text-lg"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              disabled={busy}
              aria-describedby={error ? 'migrate-error' : undefined}
              autoFocus={!passkeys.length}
            />
            <button type="submit" className={`btn w-full max-w-xs text-lg ${passkeys.length ? 'btn-soft' : 'btn-primary'}`} disabled={busy || !phrase}>
              <Icon name="key" />
              {busy ? 'Moving your pages…' : 'Move my diary into my account'}
            </button>
          </form>
          <p id="migrate-error" role="alert" className="mt-4 min-h-6 text-sm text-muted">
            {error}
          </p>
        </div>

        <button type="button" className="mt-2 text-sm text-muted underline decoration-dotted underline-offset-4 hover:text-ink" onClick={() => setFreshOpen(true)}>
          Start a new diary instead
        </button>
      </div>

      <Dialog open={freshOpen} onClose={() => setFreshOpen(false)} title="Start a new diary?">
        <p className="leading-relaxed text-muted">
          Your old diary stays on this device, untouched. Whenever you like, you can add its pages to your new diary from{' '}
          <strong className="text-ink">Settings</strong>, with its secret phrase.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-soft" onClick={() => setFreshOpen(false)}>
            Go back
          </button>
          <button type="button" className="btn btn-primary" onClick={startFresh}>
            Start a new diary
          </button>
        </div>
      </Dialog>
    </main>
  )
}
