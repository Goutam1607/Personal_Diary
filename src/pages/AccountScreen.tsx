import { useState, type FormEvent } from 'react'
import { PrivacyPromise } from '../components/PrivacyPromise'
import { LockScene } from '../components/scene/LockScene'
import { Icon } from '../components/ui/Icon'
import { MIN_PASSWORD_LENGTH } from '../lib/account'
import { useSettings } from '../state/settings'
import { useVault } from '../state/vault'

/** Signing in decides whose (encrypted) diary the server hands over. Opening it still takes the secret phrase or passkey. */
export function AccountScreen() {
  const { signIn, signUp, legacy, notice } = useVault()
  const { settings } = useSettings()
  const [mode, setMode] = useState<'new' | 'existing'>(legacy || !notice ? 'new' : 'existing')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const creating = mode === 'new'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (creating && password !== confirm) return setError('Those two passwords don’t match yet.')
    setBusy(true)
    setError('')
    try {
      if (creating) await signUp(username, password)
      else await signIn(username, password)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="page-enter flex w-full max-w-md flex-col items-center text-center">
        <LockScene kind={settings.companion} awake={creating} />
        <h1 className="font-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
          {notice ? 'Welcome back.' : legacy ? 'Your diary is getting a safer home.' : 'Welcome to your little corner.'}
        </h1>
        {notice ? (
          <p className="hand mt-2 text-2xl text-muted">{notice}</p>
        ) : legacy ? (
          <p className="mt-3 flex max-w-sm items-start gap-2 rounded-2xl bg-accent-soft/50 px-4 py-3 text-left text-sm leading-relaxed">
            <span aria-hidden="true">📦</span>
            <span>
              I found your diary on this device ({legacy.pages} {legacy.pages === 1 ? 'page' : 'pages'}). Diaries now live in your own
              account, so they aren’t lost with a device. Make an account (or sign in), and I’ll help you move it in. Nothing on this
              device is changed or deleted.
            </span>
          </p>
        ) : (
          <p className="hand mt-2 text-2xl text-muted">A private place that’s only yours. 🤍</p>
        )}

        <div role="radiogroup" aria-label="Do you have an account?" className="mt-8 grid w-full max-w-xs grid-cols-2 gap-2">
          {(
            [
              ['new', 'I’m new here'],
              ['existing', 'I have an account'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => {
                setMode(id)
                setError('')
              }}
              className={`rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${mode === id ? 'bg-accent-soft ring-2 ring-accent' : 'border border-line hover:bg-accent-soft/50'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="paper mt-4 w-full rounded-[2rem] p-6 text-left">
          <label htmlFor="acct-username" className="block text-sm font-semibold">
            Username
          </label>
          <input
            id="acct-username"
            className="field mt-1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={3}
            maxLength={64}
            autoFocus
          />

          <label htmlFor="acct-password" className="mt-4 block text-sm font-semibold">
            {creating ? 'Choose an account password' : 'Account password'}
          </label>
          <input
            id="acct-password"
            type="password"
            className="field mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={creating ? 'new-password' : 'current-password'}
            required
            minLength={creating ? MIN_PASSWORD_LENGTH : undefined}
          />

          {creating && (
            <>
              <label htmlFor="acct-confirm" className="mt-4 block text-sm font-semibold">
                Once more, just to be sure
              </label>
              <input
                id="acct-confirm"
                type="password"
                className="field mt-1"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </>
          )}

          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
            <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-accent" />
            <span>
              Your account lets you reach your diary from any device. Your diary itself stays locked with your secret phrase, which never
              leaves your device. The server only ever stores scrambled pages.
            </span>
          </p>

          {error && (
            <p role="alert" className="mt-3 text-sm font-semibold text-accent">
              {error}
            </p>
          )}
          <button className="btn btn-primary mt-5 w-full" disabled={busy || !username || !password || (creating && !confirm)}>
            {busy ? (creating ? 'Making your account…' : 'Signing in…') : creating ? 'Create my account' : 'Sign in'}
          </button>
        </form>

        <PrivacyPromise className="mt-12" />
      </div>
    </main>
  )
}
