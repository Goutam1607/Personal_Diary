import { useState } from 'react'
import { Icon } from './ui/Icon'
import { useToast } from './ui/Toast'
import { backupIsDue, connectDrive, driveConfigured, lastDriveBackup, uploadBackup } from '../lib/drive'
import { exportBackup } from '../lib/vault'
import { useVault } from '../state/vault'

const DAY = 86_400_000

export function describeLastBackup(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Not backed up to Google Drive yet.'
  const d = new Date(iso)
  const days = Math.floor((now - d.getTime()) / DAY)
  const when =
    days < 1
      ? `today at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
      : days === 1
        ? 'yesterday'
        : `${days} days ago`
  return `Last backed up to Google Drive ${when}.`
}

export function useDriveBackup() {
  const { storage } = useVault()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [last, setLast] = useState(lastDriveBackup)

  const backup = async () => {
    setError('')
    const connecting = connectDrive() // opens Google's window — must run straight from the click
    setBusy(true)
    try {
      await connecting
      await uploadBackup(await exportBackup(storage))
      setLast(lastDriveBackup())
      toast('Backed up to Google Drive ☁️🤍')
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { configured: driveConfigured(), backup, busy, error, last }
}

// "Later" hides the reminder until the app is next opened.
let dismissed = false

/** A quiet nudge on the home page when new pages haven't been backed up to Drive for a few days. */
export function BackupReminder() {
  const { entries } = useVault()
  const { configured, backup, busy, error, last } = useDriveBackup()
  const [hidden, setHidden] = useState(dismissed)
  if (
    !configured ||
    hidden ||
    !backupIsDue(
      entries.map((e) => e.updatedAt),
      last,
    )
  )
    return null
  return (
    <section aria-label="Backup reminder" className="paper flex flex-col gap-3 rounded-[1.6rem] p-4 sm:flex-row sm:items-center sm:p-5">
      <span aria-hidden="true" className="text-2xl">
        ☁️
      </span>
      <p className="flex-1 text-sm leading-relaxed">
        <strong>Keep your memories safe.</strong>{' '}
        <span className="text-muted">
          {last ? 'You’ve written new pages since your last Google Drive backup.' : 'Your pages aren’t backed up to Google Drive yet.'}
        </span>
        {error && (
          <span role="alert" className="mt-1 block font-semibold text-accent">
            {error}
          </span>
        )}
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
        <button type="button" className="btn btn-soft text-sm" onClick={backup} disabled={busy}>
          <Icon name="cloud" size={16} /> {busy ? 'Backing up…' : 'Back up now'}
        </button>
      </div>
    </section>
  )
}
