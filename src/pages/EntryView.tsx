import { useEffect, useState } from 'react'
import { Celebrate } from '../components/Celebrate'
import { Dialog } from '../components/ui/Dialog'
import { Icon } from '../components/ui/Icon'
import { useToast } from '../components/ui/Toast'
import { formatDate, formatLongDate, formatTime } from '../lib/dates'
import { kindLabel } from '../lib/entries'
import { moodEmoji, moodLabel } from '../lib/moods'
import { useAtmosphere } from '../state/atmosphere'
import { href, navigate } from '../state/router'
import { useVault } from '../state/vault'

export function EntryView({ id, capsule }: { id: string; capsule: boolean }) {
  const { entries, save, remove } = useVault()
  const { setMood } = useAtmosphere()
  const toast = useToast()
  const entry = entries.find((e) => e.id === id)
  const [opened, setOpened] = useState(!capsule)
  const [sealOpen, setSealOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sparkle, setSparkle] = useState(false)

  useEffect(() => {
    setMood(entry?.mood ?? null)
  }, [entry?.mood, setMood])

  useEffect(() => {
    setOpened(!capsule)
    setSealOpen(false)
  }, [id, capsule])

  if (!entry) {
    return (
      <div className="page-enter py-24 text-center">
        <p className="hand text-3xl">This page isn’t here anymore.</p>
        <a href={href('memories')} className="btn btn-soft mt-6">
          Back to little memories
        </a>
      </div>
    )
  }

  const chronological = entries.filter((e) => e.kind !== 'checkin')
  const idx = chronological.findIndex((e) => e.id === id)
  const newer = idx > 0 ? chronological[idx - 1] : undefined
  const older = idx >= 0 && idx < chronological.length - 1 ? chronological[idx + 1] : undefined

  const toggleFavorite = async () => {
    const favorite = !entry.favorite
    await save({ ...entry, favorite })
    if (favorite) {
      setSparkle(true)
      setTimeout(() => setSparkle(false), 2200)
      toast('Kept safe ❤️')
    }
  }

  const doDelete = async () => {
    setConfirmDelete(false)
    await remove(entry.id)
    toast('Gone. 🍃')
    navigate('memories', { replace: true })
  }

  if (!opened) {
    return (
      <div className="page-enter flex min-h-[70vh] flex-col items-center justify-center text-center">
        <button type="button" onClick={() => setOpened(true)} className="capsule group" aria-label={`Open a memory from ${formatDate(entry.date)}`}>
          <span className="capsule-flap" aria-hidden="true" />
          <span className="capsule-seal" aria-hidden="true">
            ✦
          </span>
        </button>
        <p className="hand mt-8 text-3xl">A tiny time capsule…</p>
        <p className="mt-1 text-muted">from {formatDate(entry.date)}. Tap to open.</p>
      </div>
    )
  }

  const edit = entry.kind === 'vent' ? `vent/${entry.id}` : entry.kind === 'checkin' ? `checkin/${entry.id}` : `write/${entry.id}`

  return (
    <div className="page-enter mx-auto max-w-3xl pt-2 sm:pt-6">
      {sparkle && <Celebrate kind="sparkles" count={12} />}
      <div className="mb-3 flex items-center justify-between">
        <a href={href('memories')} className="btn btn-ghost !px-3 text-sm">
          <Icon name="back" size={18} /> Little memories
        </a>
      </div>

      <article className={`paper relative rounded-[2rem] px-5 py-7 sm:px-10 sm:py-10 ${capsule ? 'unfold' : ''}`}>
        {capsule && <p className="hand -mt-1 mb-3 text-2xl text-accent">You wrote this, once…</p>}
        <header>
          <p className="text-sm font-semibold text-muted">
            {kindLabel(entry.kind)} · {formatTime(entry.createdAt)}
          </p>
          <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{formatLongDate(entry.date)}</h1>
          {(entry.mood || entry.customMood) && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent-soft/80 px-3 py-1 text-sm font-semibold">
              <span aria-hidden="true">{moodEmoji(entry.mood, entry.customMood)}</span> {moodLabel(entry.mood, entry.customMood)}
            </p>
          )}
          {entry.tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Feelings">
              {entry.tags.map((t) => (
                <li key={t} className="rounded-full border border-line px-2.5 py-0.5 text-sm text-muted">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </header>

        {entry.checkin && (
          <dl className="mt-6 grid grid-cols-2 gap-3 rounded-3xl bg-accent-soft/40 p-4 text-sm">
            {entry.checkin.day && (
              <div>
                <dt className="text-muted">How today was</dt>
                <dd className="text-lg" aria-label={`${entry.checkin.day} out of 5`}>
                  {'★'.repeat(entry.checkin.day)}
                  <span className="opacity-30">{'★'.repeat(5 - entry.checkin.day)}</span>
                </dd>
              </div>
            )}
            {entry.checkin.energy && (
              <div>
                <dt className="text-muted">Energy</dt>
                <dd className="text-lg" aria-label={`${entry.checkin.energy} out of 5`}>
                  {'▰'.repeat(entry.checkin.energy)}
                  <span className="opacity-30">{'▰'.repeat(5 - entry.checkin.energy)}</span>
                </dd>
              </div>
            )}
          </dl>
        )}

        {entry.prompt && <p className="font-write mt-6 text-lg italic text-muted">{entry.prompt}</p>}

        {(entry.body || entry.checkin?.onMind) && (
          <div className="font-write mt-6 whitespace-pre-wrap break-words text-[1.15rem] leading-[2rem] sm:text-[1.2rem]">
            {entry.body || entry.checkin?.onMind}
          </div>
        )}

        {entry.unsaid && (
          <section className="sealed mt-8 rounded-[1.4rem] p-5" aria-label="Things I couldn't say out loud">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="wax-seal">
                ♥
              </span>
              <h2 className="hand text-2xl">Things I couldn’t say out loud…</h2>
            </div>
            {sealOpen ? (
              <p className="font-write fade-in mt-3 whitespace-pre-wrap break-words text-[1.08rem] leading-relaxed">{entry.unsaid}</p>
            ) : (
              <button type="button" className="mt-3 text-sm font-semibold underline decoration-dotted underline-offset-4" onClick={() => setSealOpen(true)}>
                Open the sealed note
              </button>
            )}
          </section>
        )}

        {entry.goodThing && (
          <section className="mt-5 rounded-[1.4rem] bg-glow/20 p-5">
            <h2 className="hand text-2xl">A tiny good thing</h2>
            <p className="font-write mt-1 whitespace-pre-wrap text-[1.08rem] leading-relaxed">{entry.goodThing}</p>
          </section>
        )}

        <footer className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-5">
          <button type="button" className={`btn ${entry.favorite ? 'btn-soft' : 'btn-ghost'}`} aria-pressed={entry.favorite} onClick={toggleFavorite}>
            <span aria-hidden="true">{entry.favorite ? '❤️' : '🤍'}</span> Keep this one
          </button>
          <a href={href(edit)} className="btn btn-ghost">
            <Icon name="edit" size={18} /> Edit
          </a>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={18} /> Delete
          </button>
        </footer>
      </article>

      <nav aria-label="Other pages" className="mt-5 flex justify-between gap-3 text-sm">
        {older ? (
          <a href={href(`entry/${older.id}`)} className="btn btn-ghost">
            <Icon name="back" size={16} /> {formatDate(older.date)}
          </a>
        ) : (
          <span />
        )}
        {newer && (
          <a href={href(`entry/${newer.id}`)} className="btn btn-ghost">
            {formatDate(newer.date)} <Icon name="forward" size={16} />
          </a>
        )}
      </nav>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this page?">
        <p className="leading-relaxed text-muted">It will be gone for good — there’s no way to bring it back.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-soft" onClick={() => setConfirmDelete(false)}>
            Keep it
          </button>
          <button type="button" className="btn btn-primary" onClick={doDelete}>
            Delete
          </button>
        </div>
      </Dialog>
    </div>
  )
}
