import { formatDate, formatTime } from '../lib/dates'
import { kindLabel } from '../lib/entries'
import { moodEmoji, moodLabel } from '../lib/moods'
import { excerpt } from '../lib/stats'
import type { Entry } from '../lib/types'
import { href } from '../state/router'

export function EntryCard({ entry, showDate = true }: { entry: Entry; showDate?: boolean }) {
  const text = excerpt(entry)
  const mood = moodLabel(entry.mood, entry.customMood)
  return (
    <a
      href={href(`entry/${entry.id}`)}
      className="paper group block rounded-[1.4rem] p-4 transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft/80 text-xl">
          {entry.kind === 'vent' ? '💨' : entry.kind === 'checkin' ? '🌙' : moodEmoji(entry.mood, entry.customMood)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
            {showDate && <span className="font-bold">{formatDate(entry.date)}</span>}
            <span className="text-muted">{formatTime(entry.createdAt)}</span>
            {entry.kind !== 'entry' && <span className="text-muted">· {kindLabel(entry.kind)}</span>}
            {mood && <span className="text-muted">· {mood}</span>}
            {entry.favorite && (
              <span className="ml-auto text-accent" title="Kept">
                ❤️<span className="sr-only">Kept as a favorite</span>
              </span>
            )}
          </div>
          <p className="font-write mt-1.5 line-clamp-3 leading-relaxed text-ink/90">
            {text || <span className="italic text-muted">{entry.unsaid ? 'A sealed note…' : 'A quiet page.'}</span>}
          </p>
          {entry.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.tags.slice(0, 4).map((t) => (
                <span key={t} className="rounded-full bg-accent-soft/60 px-2 py-0.5 text-xs font-semibold text-muted">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </a>
  )
}
