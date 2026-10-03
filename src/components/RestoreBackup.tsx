import { useState } from 'react'
import { Dialog } from './ui/Dialog'
import { Icon } from './ui/Icon'
import { useToast } from './ui/Toast'
import { connectDrive, downloadBackup, driveConfigured, listDriveBackups, type DriveBackup } from '../lib/drive'
import { downloadKeepsake } from '../lib/download'
import { importBackup, openBackup, WrongSecretError, type BackupFile } from '../lib/vault'
import { useVault } from '../state/vault'

function backupLabel(b: DriveBackup): string {
  const d = new Date(b.createdTime)
  const when = `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  return b.size ? `${when} · ${Math.max(1, Math.round(Number(b.size) / 1024))} KB` : when
}

interface Props {
  open: boolean
  onClose: () => void
  /** A device with no diary yet (e.g. a new phone), where nothing gets replaced. */
  fresh?: boolean
  /** 'read' decrypts the backup into a readable keepsake book instead of restoring it. */
  mode?: 'restore' | 'read'
}

/** Restores — or just reads — an encrypted backup from a file or from Google Drive. */
export function RestoreDialog({ open, onClose, fresh = false, mode = 'restore' }: Props) {
  return (
    <Dialog open={open} onClose={onClose} title={mode === 'read' ? 'Read a backup' : fresh ? 'Bring your diary back' : 'Restore a backup'}>
      {/* Rendered only while open, so the phrase and decrypted data are dropped when it closes. */}
      <RestoreForm onClose={onClose} fresh={fresh} reading={mode === 'read'} />
    </Dialog>
  )
}

function RestoreForm({ onClose, fresh, reading }: { onClose: () => void; fresh: boolean; reading: boolean }) {
  const toast = useToast()
  const { storage, reload } = useVault()
  const drive = driveConfigured()
  const [source, setSource] = useState<'file' | 'drive'>(drive ? 'drive' : 'file')
  const [file, setFile] = useState<BackupFile | null>(null)
  const [driveList, setDriveList] = useState<DriveBackup[] | null>(null)
  const [driveId, setDriveId] = useState('')
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'' | 'drive' | 'restore'>('')

  const loadDrive = async () => {
    setError('')
    const connecting = connectDrive() // opens Google's window — must run straight from the click
    setBusy('drive')
    try {
      await connecting
      const list = await listDriveBackups()
      setDriveList(list)
      setDriveId(list[0]?.id ?? '')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy('')
    }
  }

  const ready = !!phrase && (source === 'file' ? !!file : !!driveId)

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ready) return
        setBusy('restore')
        setError('')
        try {
          const backup = source === 'file' ? file! : await downloadBackup(driveId)
          if (reading) {
            const { entries, settings } = await openBackup(backup, phrase)
            await downloadKeepsake(entries, settings.name)
            toast('Your little book is ready 📖')
            setBusy('')
            onClose()
            return
          }
          await importBackup(storage, backup, phrase)
          onClose()
          await reload()
        } catch (err) {
          setError(err instanceof WrongSecretError ? 'That phrase doesn’t open this backup.' : (err as Error).message)
          setBusy('')
        }
      }}
    >
      <p className="text-sm leading-relaxed text-muted">
        {reading ? (
          <>
            Unlocks a backup here on this device and saves it as a readable book (an HTML file you can also save as PDF). Your diary on this
            device isn’t changed. The book <strong className="text-ink">isn’t encrypted</strong>, so keep it somewhere private.
          </>
        ) : fresh ? (
          <>Everything comes back just as it was. Afterwards you’ll unlock it with the secret phrase the backup was made with.</>
        ) : (
          <>
            Restoring <strong className="text-ink">replaces</strong> the diary on this device with the one in the backup. You’ll unlock it
            with the phrase the backup was made with.
          </>
        )}
      </p>

      {drive && (
        <div role="radiogroup" aria-label="Where is your backup?" className="grid grid-cols-2 gap-2">
          {(
            [
              ['drive', 'Google Drive', 'cloud'],
              ['file', 'A backup file', 'upload'],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={source === id}
              onClick={() => {
                setSource(id)
                setError('')
              }}
              className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${source === id ? 'bg-accent-soft ring-2 ring-accent' : 'border border-line hover:bg-accent-soft/50'}`}
            >
              <Icon name={icon} size={18} /> {label}
            </button>
          ))}
        </div>
      )}

      {source === 'file' ? (
        <div>
          <label htmlFor="backup-file" className="text-sm font-semibold">
            Backup file
          </label>
          <input
            id="backup-file"
            type="file"
            accept="application/json,.json"
            className="mt-1 block w-full text-sm"
            onChange={async (e) => {
              setError('')
              const f = e.target.files?.[0]
              if (!f) return setFile(null)
              try {
                setFile(JSON.parse(await f.text()))
              } catch {
                setError('That file couldn’t be read.')
                setFile(null)
              }
            }}
          />
        </div>
      ) : driveList === null ? (
        <button type="button" className="btn btn-soft w-full" onClick={loadDrive} disabled={!!busy}>
          <Icon name="cloud" size={18} /> {busy === 'drive' ? 'Waiting for Google…' : 'Find my backups in Google Drive'}
        </button>
      ) : driveList.length === 0 ? (
        <p className="rounded-2xl bg-accent-soft/60 p-3 text-sm">
          No backups from this diary were found in that Google account. Make sure you picked the same account you backed up to.
        </p>
      ) : (
        <div>
          <label htmlFor="drive-backup" className="text-sm font-semibold">
            Which backup?
          </label>
          <select id="drive-backup" className="field mt-1" value={driveId} onChange={(e) => setDriveId(e.target.value)}>
            {driveList.map((b, i) => (
              <option key={b.id} value={b.id}>
                {backupLabel(b)}
                {i === 0 ? ' (newest)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="restore-phrase" className="text-sm font-semibold">
          The backup’s secret phrase
        </label>
        <input
          id="restore-phrase"
          type="password"
          className="field mt-1"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          autoComplete="current-password"
        />
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
        <button className="btn btn-primary" disabled={!!busy || !ready}>
          {busy === 'restore' ? (reading ? 'Unlocking…' : 'Restoring…') : reading ? 'Make my book' : 'Restore'}
        </button>
      </div>
    </form>
  )
}
