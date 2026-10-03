import { useEffect, useState, type ReactNode } from 'react'
import { DeviceDiaryPanel } from '../components/LegacyDiary'
import { MIN_PASSWORD_LENGTH } from '../lib/account'
import { Companion } from '../components/companion/Companion'
import { COMPANION_KINDS, SPECIES } from '../components/companion/species'
import { describeLastBackup, useDriveBackup } from '../components/DriveBackup'
import { PasskeySetup } from '../components/PasskeySetup'
import { RestoreDialog } from '../components/RestoreBackup'
import { Dialog } from '../components/ui/Dialog'
import { Icon } from '../components/ui/Icon'
import { useToast } from '../components/ui/Toast'
import { formatLongDate, formatTime } from '../lib/dates'
import { moodLabel } from '../lib/moods'
import { changePhrase, exportBackup, MIN_PHRASE_LENGTH, removePasskey, WrongSecretError } from '../lib/vault'
import { useAtmosphere } from '../state/atmosphere'
import { useSettings } from '../state/settings'
import { useVault } from '../state/vault'
import type { Entry } from '../lib/types'
import { download, downloadKeepsake } from '../lib/download'

function readable(entries: Entry[]): string {
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((e) => {
      const lines = [`## ${formatLongDate(e.date)} · ${formatTime(e.createdAt)}`]
      const mood = moodLabel(e.mood, e.customMood)
      if (mood) lines.push(`Mood: ${mood}`)
      if (e.tags.length) lines.push(`Feelings: ${e.tags.join(', ')}`)
      if (e.favorite) lines.push('❤️ Kept')
      if (e.prompt) lines.push(`\n*${e.prompt}*`)
      if (e.body) lines.push('', e.body)
      if (e.checkin?.day) lines.push(`How today was: ${e.checkin.day}/5`)
      if (e.checkin?.energy) lines.push(`Energy: ${e.checkin.energy}/5`)
      if (e.checkin?.onMind) lines.push('', e.checkin.onMind)
      if (e.unsaid) lines.push('', '### Things I couldn’t say out loud…', e.unsaid)
      if (e.goodThing) lines.push('', '### A tiny good thing', e.goodThing)
      return lines.join('\n')
    })
    .join('\n\n---\n\n')
}

export function Settings() {
  const vault = useVault()
  const { settings, update } = useSettings()
  const { setMood } = useAtmosphere()
  const toast = useToast()
  const [name, setName] = useState(vault.privateSettings.name)
  const [passkeyOpen, setPasskeyOpen] = useState(false)
  const [phraseOpen, setPhraseOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [eraseOpen, setEraseOpen] = useState(false)
  const [readableOpen, setReadableOpen] = useState(false)
  const [readBackupOpen, setReadBackupOpen] = useState(false)
  const [accountPasswordOpen, setAccountPasswordOpen] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const drive = useDriveBackup()

  useEffect(() => setMood(null), [setMood])

  return (
    <div className="page-enter mx-auto max-w-3xl pt-4 sm:pt-8">
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Settings</h1>
      <p className="hand mt-1 text-2xl text-muted">Make this corner feel like yours.</p>

      <Section title="You">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            await vault.updatePrivate({ name: name.trim() })
            toast('Got it 🤍')
          }}
        >
          <div className="min-w-48 flex-1">
            <label htmlFor="set-name" className="text-sm font-semibold">
              What should I call you?
            </label>
            <input id="set-name" className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="(optional)" />
          </div>
          <button className="btn btn-soft">Save</button>
        </form>
      </Section>

      <Section title="Your account" icon="key">
        <p className="text-sm leading-relaxed">
          Signed in as <strong>{vault.account}</strong>. Your diary is kept in your account, so you can open it on any device with your
          secret phrase.
        </p>
        {vault.pending > 0 && (
          <p className="flex items-start gap-2 text-sm leading-relaxed text-muted">
            <Icon name="cloud" size={18} className="mt-0.5 shrink-0 text-accent" />
            {vault.pending === 1 ? 'One save is' : `${vault.pending} saves are`} kept safely on this device, waiting to reach your account.
            They’ll go as soon as the connection is back.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost text-sm" onClick={() => setAccountPasswordOpen(true)}>
            <Icon name="key" size={16} /> Change account password
          </button>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={async () => {
              setSignOutError('')
              try {
                await vault.signOut()
              } catch (err) {
                setSignOutError((err as Error).message)
              }
            }}
          >
            <Icon name="lock" size={16} /> Sign out on this device
          </button>
        </div>
        {signOutError && (
          <p role="alert" className="text-sm font-semibold text-accent">
            {signOutError}
          </p>
        )}
        <DeviceDiaryPanel />
      </Section>

      <Section title="Your companion">
        <div role="radiogroup" aria-label="Companion" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {COMPANION_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={settings.companion === k}
              onClick={() => update({ companion: k })}
              className={`flex flex-col items-center rounded-2xl p-1 pb-2 transition ${settings.companion === k ? 'bg-accent-soft ring-2 ring-accent' : 'hover:bg-accent-soft/50'}`}
            >
              <Companion kind={k} face={settings.companion === k ? 'smile' : 'content'} pose="read" size={78} title={SPECIES[k].name} />
              <span className="text-xs font-semibold">{SPECIES[k].name.split(' the ')[0]}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Look & feel">
        <Choice
          label="Day or night"
          value={settings.theme}
          onChange={(theme) => update({ theme })}
          options={[
            ['auto', 'Automatic', 'Night after 8pm, or when your device is in dark mode'],
            ['day', 'Always day', ''],
            ['night', 'Always night', ''],
          ]}
        />
        <Choice
          label="Animations"
          value={settings.reduceMotion}
          onChange={(reduceMotion) => update({ reduceMotion })}
          options={[
            ['system', 'Follow my device', ''],
            ['off', 'Gentle animations on', ''],
            ['on', 'Keep everything still', ''],
          ]}
        />
        <Toggle label="Larger text" checked={settings.largeText} onChange={(largeText) => update({ largeText })} />
      </Section>

      <Section title="Privacy & locking" icon="lock">
        <div>
          <label htmlFor="autolock" className="text-sm font-semibold">
            Lock automatically after I’ve been away for
          </label>
          <select
            id="autolock"
            className="field mt-1 !w-auto"
            value={settings.autoLockMinutes}
            onChange={(e) => update({ autoLockMinutes: Number(e.target.value) })}
          >
            {[1, 3, 5, 10, 15, 30].map((m) => (
              <option key={m} value={m}>
                {m} {m === 1 ? 'minute' : 'minutes'}
              </option>
            ))}
          </select>
        </div>
        <Toggle
          label="Lock when I switch to another tab or app for more than a minute"
          checked={settings.lockWhenHidden}
          onChange={(lockWhenHidden) => update({ lockWhenHidden })}
        />

        <div className="rounded-3xl border border-line p-4">
          <h3 className="font-semibold">Passkeys</h3>
          {vault.passkeys.length ? (
            <ul className="mt-2 space-y-2">
              {vault.passkeys.map((p) => (
                <li key={p.credentialId} className="flex items-center gap-3 text-sm">
                  <Icon name="fingerprint" size={18} className="text-accent" />
                  <span className="flex-1">
                    {p.label} <span className="text-muted">· added {new Date(p.createdAt).toLocaleDateString()}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost !min-h-8 !px-2 text-xs"
                    onClick={async () => {
                      await removePasskey(vault.storage, p.credentialId)
                      await vault.refreshPasskeys()
                      toast('Passkey removed')
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">None yet. You unlock with your secret phrase.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-soft text-sm" onClick={() => setPasskeyOpen(true)}>
              <Icon name="plus" size={16} /> Add a passkey
            </button>
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setPhraseOpen(true)}>
              <Icon name="key" size={16} /> Change secret phrase
            </button>
          </div>
        </div>
      </Section>

      <Section title="Backups" icon="download">
        <p className="text-sm leading-relaxed text-muted">
          Your diary is kept in your account on the server. Keep a backup of your own too: it’s a copy only you control, and your safety
          net if anything ever happens to the server. Backups stay encrypted and open only with your secret phrase.
        </p>
        {drive.configured && (
          <div className="rounded-3xl border border-line p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <Icon name="cloud" size={18} className="text-accent" /> Google Drive
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Keeps encrypted copies in a “my little corner backups” folder in your Google Drive, so your memories survive even if this
              device doesn’t. Google only ever sees scrambled data. {describeLastBackup(drive.last)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-soft text-sm" onClick={drive.backup} disabled={drive.busy}>
                <Icon name="cloud" size={16} /> {drive.busy ? 'Backing up…' : 'Back up to Google Drive'}
              </button>
            </div>
            {drive.error && (
              <p role="alert" className="mt-2 text-sm font-semibold text-accent">
                {drive.error}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-soft text-sm"
            onClick={async () => {
              const b = await exportBackup(vault.storage)
              download(`little-corner-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b), 'application/json')
              toast('Backup saved 🤍')
            }}
          >
            <Icon name="download" size={16} /> Download encrypted backup
          </button>
          <button type="button" className="btn btn-ghost text-sm" onClick={() => setRestoreOpen(true)}>
            <Icon name="upload" size={16} /> Restore a backup
          </button>
          <button type="button" className="btn btn-ghost text-sm" onClick={() => setReadableOpen(true)}>
            <Icon name="book" size={16} /> Download my memories
          </button>
          <button type="button" className="btn btn-ghost text-sm" onClick={() => setReadBackupOpen(true)}>
            <Icon name="book" size={16} /> Read a backup
          </button>
        </div>
      </Section>

      <Section title="How private is this, really?" icon="shield">
        <PrivacyExplainer />
      </Section>

      <Section title="Start over">
        <p className="text-sm text-muted">Erase every page in your account. This can’t be undone from here.</p>
        <button type="button" className="btn btn-ghost w-fit text-sm" onClick={() => setEraseOpen(true)}>
          <Icon name="trash" size={16} /> Erase my diary
        </button>
      </Section>

      <Dialog open={passkeyOpen} onClose={() => setPasskeyOpen(false)} title="Add a passkey" hideTitle>
        <PasskeySetup onDone={() => setPasskeyOpen(false)} />
      </Dialog>
      <ChangePhraseDialog open={phraseOpen} onClose={() => setPhraseOpen(false)} />
      <ChangeAccountPasswordDialog open={accountPasswordOpen} onClose={() => setAccountPasswordOpen(false)} />
      <RestoreDialog open={restoreOpen} onClose={() => setRestoreOpen(false)} />
      <RestoreDialog open={readBackupOpen} onClose={() => setReadBackupOpen(false)} mode="read" />
      <ReadableDialog open={readableOpen} onClose={() => setReadableOpen(false)} entries={vault.entries} name={vault.privateSettings.name} />
      <EraseDialog open={eraseOpen} onClose={() => setEraseOpen(false)} />
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon?: 'lock' | 'download' | 'shield' | 'key'; children: ReactNode }) {
  return (
    <section className="paper mt-6 rounded-[1.8rem] p-5 sm:p-7">
      <h2 className="font-display mb-4 flex items-center gap-2 text-xl font-semibold">
        {icon && <Icon name={icon} size={20} className="text-accent" />}
        {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function Choice<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string, string][] }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(([v, text, hint]) => (
          <label key={v} className={`cursor-pointer rounded-2xl border px-4 py-2 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${value === v ? 'border-accent bg-accent-soft font-semibold' : 'border-line hover:bg-accent-soft/40'}`} title={hint || undefined}>
            <input type="radio" className="sr-only" name={label} checked={value === v} onChange={() => onChange(v)} />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold">
      <span>{label}</span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${checked ? 'bg-accent' : 'bg-line'}`}
      >
        <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </label>
  )
}

function PrivacyExplainer() {
  return (
    <div className="space-y-3 text-[0.95rem] leading-relaxed">
      <p>
        <strong>What’s protected:</strong> every entry, your moods, tags, sealed notes, your name and today’s mood are encrypted with
        AES-256-GCM before they’re saved. The encryption key is made from your secret phrase (PBKDF2, 600,000 rounds) or from your passkey
        (WebAuthn PRF). Neither the phrase nor the key is ever stored — only locked copies of the key that need your phrase or passkey to
        open. Someone who copies this browser’s files sees only scrambled data.
      </p>
      <p>
        <strong>Where it lives:</strong> in your account, in this site’s database. Pages are encrypted on your device before they’re sent,
        so the server only ever stores scrambled data. Your account password just lets you sign in; it can’t open the diary, and your
        secret phrase never leaves your device. If you’re offline, new words wait on this device (still encrypted) until they can be sent.
        The page loads no outside fonts, trackers or analytics.
      </p>
      <p>
        <strong>What the server can see:</strong> your username, how many pages you have, roughly how long each one is, and when they
        were saved. Not what they say, your moods or your tags. It can’t unlock your diary. But your phrase is guessable offline if it’s
        short, by anyone who got a copy of the database, so a long phrase matters.
      </p>
      <p>
        <strong>Honestly, it isn’t “end-to-end” in the strictest sense:</strong> the same website that stores your encrypted pages also
        delivers the app’s code. Someone who took over the site could change that code to capture your phrase the next time you type it.
        What the encryption does guarantee is that a stolen or leaked database (or its backups) only contains pages nobody can read
        without your phrase or passkey.
      </p>
      <p>
        <strong>What it can’t protect against:</strong> while the diary is <em>unlocked</em>, anyone using this device can read it —
        that’s what auto-lock is for. Malware or a malicious browser extension on your device could also see what’s on screen. A short or
        guessable phrase can be brute-forced by someone who copies the encrypted data, so a longer phrase is safer. Changing your phrase
        protects your diary from now on, but older database backups still open with the old phrase for as long as they’re kept. And
        because only you hold the key, a forgotten phrase (with no passkey) can’t be recovered by anyone.
      </p>
      <p className="text-muted">
        Not stored encrypted: look-and-feel preferences (day/night, text size, animations, which companion, auto-lock time), because they’re
        needed before unlocking. They reveal nothing you’ve written.
      </p>
    </div>
  )
}

function ChangePhraseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { storage } = useVault()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onClose={onClose} title="Change your secret phrase">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (next !== confirm) return setError('The new phrases don’t match yet.')
          setBusy(true)
          setError('')
          try {
            await changePhrase(storage, current, next)
            toast('New phrase set 🤍')
            setCurrent('')
            setNext('')
            setConfirm('')
            onClose()
          } catch (err) {
            setError(err instanceof WrongSecretError ? 'Your current phrase didn’t match.' : (err as Error).message)
          }
          setBusy(false)
        }}
      >
        <PasswordField id="cp-current" label="Current phrase" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField id="cp-next" label={`New phrase (at least ${MIN_PHRASE_LENGTH} characters)`} value={next} onChange={setNext} autoComplete="new-password" />
        <PasswordField id="cp-confirm" label="New phrase again" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && (
          <p role="alert" className="text-sm font-semibold text-accent">
            {error}
          </p>
        )}
        <p className="text-xs text-muted">Your passkeys keep working. Older backups still open with the phrase they were made with.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !current || next.length < MIN_PHRASE_LENGTH}>
            {busy ? 'Changing…' : 'Change phrase'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function ChangeAccountPasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { changeAccountPassword } = useVault()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onClose={onClose} title="Change your account password">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (next !== confirm) return setError('The new passwords don’t match yet.')
          setBusy(true)
          setError('')
          try {
            await changeAccountPassword(current, next)
            toast('New account password set 🤍')
            setCurrent('')
            setNext('')
            setConfirm('')
            onClose()
          } catch (err) {
            setError((err as Error).message)
          }
          setBusy(false)
        }}
      >
        <PasswordField id="ap-current" label="Current account password" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField id="ap-next" label={`New account password (at least ${MIN_PASSWORD_LENGTH} characters)`} value={next} onChange={setNext} autoComplete="new-password" />
        <PasswordField id="ap-confirm" label="New account password again" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {error && (
          <p role="alert" className="text-sm font-semibold text-accent">
            {error}
          </p>
        )}
        <p className="text-xs text-muted">
          This is the password you sign in with. It doesn’t change your secret phrase. Other devices will be signed out.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !current || next.length < MIN_PASSWORD_LENGTH}>
            {busy ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function PasswordField({ id, label, value, onChange, autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input id={id} type="password" className="field mt-1" value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} />
    </div>
  )
}

function ReadableDialog({ open, onClose, entries, name }: { open: boolean; onClose: () => void; entries: Entry[]; name: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const stamp = () => new Date().toISOString().slice(0, 10)
  return (
    <Dialog open={open} onClose={onClose} title="Take your memories with you">
      <p className="leading-relaxed text-muted">
        A <strong className="text-ink">keepsake book</strong> opens in any browser as a little book of all your pages — month by month,
        with your moods, kept pages and tiny good things. You can print it or save it as a PDF too.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Unlike a backup, <strong className="text-ink">this copy isn’t encrypted</strong> — anyone who opens the file can read it. Keep it
        somewhere private.
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={() => {
            download(`my-little-corner-${stamp()}.md`, `# my little corner

${readable(entries)}
`, 'text/markdown')
            onClose()
          }}
        >
          Plain text instead
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await downloadKeepsake(entries, name)
              toast('Your little book is ready 📖')
              onClose()
            } finally {
              setBusy(false)
            }
          }}
        >
          <Icon name="book" size={16} /> {busy ? 'Making your book…' : 'Download keepsake book'}
        </button>
      </div>
    </Dialog>
  )
}

function EraseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { storage, reload } = useVault()
  const [confirm, setConfirm] = useState('')
  return (
    <Dialog open={open} onClose={onClose} title="Erase your diary?">
      <p className="leading-relaxed text-muted">
        Every page in your account will be deleted. If you want to keep them, download a backup first. (The server keeps an encrypted
        copy for 30 days in case this was a mistake, then it’s gone for good.) Type <strong className="text-ink">erase everything</strong> to
        confirm.
      </p>
      <input className="field mt-3" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Type erase everything to confirm" />
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn btn-soft" onClick={onClose}>
          Keep my diary
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={confirm.trim().toLowerCase() !== 'erase everything'}
          onClick={async () => {
            await storage.destroy()
            onClose()
            await reload()
          }}
        >
          Erase
        </button>
      </div>
    </Dialog>
  )
}
