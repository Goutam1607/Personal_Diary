import { useState, type FormEvent } from 'react'
import { Dialog } from './ui/Dialog'
import { Icon } from './ui/Icon'
import { useToast } from './ui/Toast'
import { PasskeyError } from '../lib/passkey'
import { WrongSecretError } from '../lib/vault'
import { useVault } from '../state/vault'

// "Later" hides the reminder until the app is next opened.
let dismissed = false

/** On the home page: a quiet note when an older diary on this device isn't in the account yet. */
export function LegacyReminder() {
  const { legacy } = useVault()
  const [hidden, setHidden] = useState(dismissed)
  const [open, setOpen] = useState(false)
  if (!legacy || hidden) return null
  return (
    <section aria-label="An older diary on this device" className="paper flex flex-col gap-3 rounded-[1.6rem] p-4 sm:flex-row sm:items-center sm:p-5">
      <span aria-hidden="true" className="text-2xl">
        📦
      </span>
      <p className="flex-1 text-sm leading-relaxed">
        <strong>An older diary is still on this device.</strong>{' '}
        <span className="text-muted">
          {legacy.pages} {legacy.pages === 1 ? 'page isn’t' : 'pages aren’t'} in your account yet.
        </span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={() => {
            dismissed = true
            setHidden(true)
          }}
        >
          Later
        </button>
        <button type="button" className="btn btn-soft text-sm" onClick={() => setOpen(true)}>
          <Icon name="upload" size={16} /> Bring them in
        </button>
      </div>
      <MergeDialog open={open} onClose={() => setOpen(false)} />
    </section>
  )
}

/** In Settings: bring an older device diary in, or (once it's in) remove the device copy. */
export function DeviceDiaryPanel() {
  const { legacy, movedLegacy, removeLegacyCopy } = useVault()
  const toast = useToast()
  const [mergeOpen, setMergeOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [error, setError] = useState('')
  if (!legacy && !movedLegacy) return null
  return (
    <div className="rounded-3xl border border-line p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <span aria-hidden="true">📦</span> The diary on this device
      </h3>
      {legacy ? (
        <>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            This browser still holds a diary from before accounts ({legacy.pages} {legacy.pages === 1 ? 'page' : 'pages'}) that isn’t in
            your account yet. Bring its pages in to keep them safe. You’ll need that diary’s secret phrase.
          </p>
          <button type="button" className="btn btn-soft mt-3 text-sm" onClick={() => setMergeOpen(true)}>
            <Icon name="upload" size={16} /> Bring its pages into my account
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Its pages are safely in your account now. The old copy is still in this browser; you can remove it once you’re happy everything
            came along.
          </p>
          <button type="button" className="btn btn-ghost mt-3 text-sm" onClick={() => setRemoveOpen(true)}>
            <Icon name="trash" size={16} /> Remove the old copy from this device
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-accent">
          {error}
        </p>
      )}
      <MergeDialog open={mergeOpen} onClose={() => setMergeOpen(false)} />
      <Dialog open={removeOpen} onClose={() => setRemoveOpen(false)} title="Remove the old copy?">
        <p className="leading-relaxed text-muted">
          I’ll check once more that every page from this device is in your account, and only then remove the copy in this browser. Your
          diary in your account isn’t touched.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-soft" onClick={() => setRemoveOpen(false)}>
            Keep it
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              setError('')
              try {
                await removeLegacyCopy()
                toast('The old copy is gone. Your diary is safe in your account 🤍')
              } catch (err) {
                setError((err as Error).message)
              }
              setRemoveOpen(false)
            }}
          >
            Remove it
          </button>
        </div>
      </Dialog>
    </div>
  )
}

function MergeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Bring your older pages in">
      {/* Rendered only while open, so the phrase is dropped when it closes. */}
      <MergeForm onClose={onClose} />
    </Dialog>
  )
}

function MergeForm({ onClose }: { onClose: () => void }) {
  const { legacy, mergeLegacy } = useVault()
  const toast = useToast()
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const passkeys = legacy?.passkeys ?? []

  const run = async (secret: Parameters<typeof mergeLegacy>[0]) => {
    setBusy(true)
    setError('')
    try {
      const { added, skipped } = await mergeLegacy(secret)
      toast(
        added
          ? `Added ${added} ${added === 1 ? 'page' : 'pages'} to your diary 🤍`
          : skipped
            ? 'Those pages were already in your diary 🤍'
            : 'There were no pages to bring in.',
      )
      onClose()
    } catch (err) {
      setBusy(false)
      setError(
        err instanceof WrongSecretError
          ? 'That phrase doesn’t open the diary on this device.'
          : err instanceof PasskeyError && err.kind === 'cancelled'
            ? 'No worries. You can try again, or use the phrase.'
            : (err as Error).message,
      )
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        if (phrase) void run({ phrase })
      }}
    >
      <p className="text-sm leading-relaxed text-muted">
        Each page is unlocked here with the old diary’s phrase, locked again with your account diary’s key, and added. Pages already in
        your account are never replaced, and the copy on this device isn’t changed.
      </p>
      {passkeys.length > 0 && (
        <button type="button" className="btn btn-soft w-full" disabled={busy} onClick={() => void run({ passkey: passkeys[0] })}>
          <Icon name="fingerprint" size={18} /> Unlock it with its passkey
        </button>
      )}
      <div>
        <label htmlFor="merge-phrase" className="text-sm font-semibold">
          The older diary’s secret phrase
        </label>
        <input id="merge-phrase" type="password" className="field mt-1" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" />
      </div>
      {error && (
        <p role="alert" className="text-sm font-semibold text-accent">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy || !phrase}>
          {busy ? 'Bringing them in…' : 'Bring them in'}
        </button>
      </div>
    </form>
  )
}
