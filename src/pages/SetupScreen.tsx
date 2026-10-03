import { useState, type FormEvent } from 'react'
import { Companion } from '../components/companion/Companion'
import { COMPANION_KINDS, SPECIES } from '../components/companion/species'
import { LockScene } from '../components/scene/LockScene'
import { Icon } from '../components/ui/Icon'
import { MIN_PHRASE_LENGTH } from '../lib/vault'
import { useSettings } from '../state/settings'
import { useVault } from '../state/vault'
import { PasskeySetup } from '../components/PasskeySetup'
import { RestoreDialog } from '../components/RestoreBackup'

type Step = 'hello' | 'companion' | 'phrase' | 'passkey'

function phraseHint(p: string): { text: string; ok: boolean } {
  if (!p) return { text: 'A little sentence only you would think of works beautifully.', ok: false }
  if (p.length < MIN_PHRASE_LENGTH) return { text: `A bit longer, please — at least ${MIN_PHRASE_LENGTH} characters.`, ok: false }
  if (p.length < 14 && !/\s/.test(p)) return { text: 'That works. A few words together would be even stronger.', ok: true }
  return { text: 'Lovely. That’s a strong one.', ok: true }
}

export function SetupScreen() {
  const { create } = useVault()
  const [enter, setEnter] = useState<(() => Promise<void>) | null>(null)
  const { settings, update } = useSettings()
  const [step, setStep] = useState<Step>('hello')
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [name, setName] = useState('')
  const [phrase, setPhrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const hint = phraseHint(phrase)

  const createDiary = async (e: FormEvent) => {
    e.preventDefault()
    if (phrase !== confirm) return setError('Those two don’t match yet.')
    if (!hint.ok || !understood) return
    setBusy(true)
    setError('')
    try {
      const open = await create(phrase, name.trim())
      setEnter(() => open)
      setBusy(false)
      setStep('passkey')
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-10">
      <div key={step} className="page-enter w-full max-w-lg">
        {step === 'hello' && (
          <div className="flex flex-col items-center text-center">
            <LockScene kind={settings.companion} awake />
            <h1 className="font-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Let’s make you a little corner.</h1>
            <p className="mt-3 max-w-sm leading-relaxed text-muted">
              A private place to write about your days, your feelings, and anything you don’t feel like telling anyone else.
            </p>
            <p className="promise-whisper mt-4 flex max-w-sm items-start gap-3 rounded-2xl px-4 py-3 text-left text-sm leading-relaxed">
              <span className="wax-seal mt-0.5 shrink-0" aria-hidden="true">
                <Icon name="lock" size={14} />
              </span>
              <span>
                <strong>This corner is only yours.</strong> Everything you write is encrypted on this device before it’s saved to your account, so the
                server only keeps scrambled pages. Not even the person who runs this site can read them.
              </span>
            </p>
            <form
              className="mt-8 w-full max-w-xs"
              onSubmit={(e) => {
                e.preventDefault()
                setStep('companion')
              }}
            >
              <label htmlFor="name" className="hand block text-2xl">
                What should I call you?
              </label>
              <input
                id="name"
                className="field mt-2 text-center"
                placeholder="(optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
              <button className="btn btn-primary mt-5 w-full">Continue</button>
            </form>
            <button type="button" className="mt-4 text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => setRestoreOpen(true)}>
              Already have a diary? Bring it back from a backup
            </button>
            <RestoreDialog open={restoreOpen} onClose={() => setRestoreOpen(false)} fresh />
          </div>
        )}

        {step === 'companion' && (
          <div className="text-center">
            <h1 className="font-display text-3xl font-semibold tracking-tight">Who would you like to keep you company?</h1>
            <p className="mt-2 text-muted">They won’t talk much. They’ll just be there.</p>
            <div role="radiogroup" aria-label="Choose a companion" className="mt-8 grid grid-cols-3 gap-3">
              {COMPANION_KINDS.map((k) => {
                const selected = settings.companion === k
                return (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => update({ companion: k })}
                    className={`paper flex flex-col items-center rounded-3xl p-2 pb-3 transition ${selected ? 'outline-2 outline-offset-2 outline-accent' : 'opacity-85 hover:opacity-100'}`}
                  >
                    <Companion kind={k} face={selected ? 'smile' : 'content'} pose={selected ? 'wave' : 'read'} size={96} title={SPECIES[k].name} />
                    <span className="hand text-lg leading-tight">{SPECIES[k].name.split(' the ')[0]}</span>
                    <span className="text-xs text-muted">{SPECIES[k].name.split(' the ')[1]}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-8 flex justify-center gap-3">
              <button className="btn btn-ghost" onClick={() => setStep('hello')}>
                Back
              </button>
              <button className="btn btn-primary" onClick={() => setStep('phrase')}>
                This one 🤍
              </button>
            </div>
          </div>
        )}

        {step === 'phrase' && (
          <form onSubmit={createDiary} className="paper rounded-[2rem] p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <Icon name="shield" size={28} className="text-accent" />
              <h1 className="font-display text-2xl font-semibold tracking-tight">Choose your secret phrase</h1>
            </div>
            <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">
              This phrase is the key that locks your diary. Everything you write is encrypted with it before it’s saved, and the phrase
              itself is never stored anywhere. Next, you can also add a passkey (fingerprint, face or Windows Hello) so you don’t have to
              type it every night.
            </p>

            <label htmlFor="new-phrase" className="mt-6 block text-sm font-semibold">
              Secret phrase
            </label>
            <input
              id="new-phrase"
              type="password"
              autoComplete="new-password"
              className="field mt-1"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              aria-describedby="phrase-hint"
              autoFocus
            />
            <p id="phrase-hint" className={`mt-1.5 text-sm ${hint.ok ? 'text-ink' : 'text-muted'}`}>
              {hint.text}
            </p>

            <label htmlFor="confirm-phrase" className="mt-4 block text-sm font-semibold">
              Once more, just to be sure
            </label>
            <input
              id="confirm-phrase"
              type="password"
              autoComplete="new-password"
              className="field mt-1"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-accent-soft/60 p-3 text-sm leading-relaxed">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              <span>
                I understand that if I forget this phrase and lose my passkey, <strong>nobody can recover my diary</strong> — that’s what
                keeps it truly mine.
              </span>
            </label>

            {error && (
              <p role="alert" className="mt-3 text-sm font-semibold text-accent">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <button type="button" className="btn btn-ghost" onClick={() => setStep('companion')}>
                Back
              </button>
              <button className="btn btn-primary" disabled={busy || !hint.ok || !understood || !confirm}>
                {busy ? 'Making your corner…' : 'Lock it with this phrase'}
              </button>
            </div>
          </form>
        )}

        {step === 'passkey' && enter && (
          <div className="paper rounded-[2rem] p-6 sm:p-8">
            <PasskeySetup phrase={phrase} onDone={enter} intro />
          </div>
        )}
      </div>
    </main>
  )
}
