import { useEffect, useMemo } from 'react'
import { dayKey, formatDate, weekdayNames } from '../lib/dates'
import { MOOD_BY_ID, moodEmoji } from '../lib/moods'
import { journey } from '../lib/stats'
import { useAtmosphere } from '../state/atmosphere'
import { href } from '../state/router'
import { useVault } from '../state/vault'

/** Gentle numbers only: no streaks, no goals, no "you missed a day". */
export function Journey() {
  const { entries } = useVault()
  const { setMood } = useAtmosphere()
  useEffect(() => setMood(null), [setMood])
  const j = useMemo(() => journey(entries), [entries])
  const names = weekdayNames()
  const favDay = j.weekdays.some(Boolean) ? j.weekdays.indexOf(Math.max(...j.weekdays)) : -1
  const times = ['Mornings', 'Afternoons', 'Evenings', 'Late nights']
  const favTime = j.timesOfDay.some(Boolean) ? j.timesOfDay.indexOf(Math.max(...j.timesOfDay)) : -1

  // a little quilt of the last five weeks
  const quilt = useMemo(() => {
    const byDay = new Map<string, (typeof entries)[number]>()
    for (const e of [...entries].reverse()) if (e.kind === 'entry' || !byDay.has(e.date)) byDay.set(e.date, e)
    const today = new Date()
    return Array.from({ length: 35 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 34 + i)
      const key = dayKey(d)
      return { key, entry: byDay.get(key) }
    })
  }, [entries])

  if (!entries.length) {
    return (
      <div className="page-enter py-20 text-center">
        <h1 className="font-display text-4xl font-semibold tracking-tight">My journey</h1>
        <p className="hand mt-4 text-3xl">Every journey starts with one little page.</p>
        <p className="mt-2 text-muted">No pressure. Your diary will still be here.</p>
        <a href={href('write')} className="btn btn-primary mt-8">
          Write something small
        </a>
      </div>
    )
  }

  return (
    <div className="page-enter pt-4 sm:pt-8">
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">My journey</h1>
      <p className="hand mt-3 max-w-2xl text-3xl leading-snug">
        {j.daysThisMonth > 0
          ? `You’ve been showing up for yourself ${j.daysThisMonth} ${j.daysThisMonth === 1 ? 'time' : 'times'} this month 🤍`
          : 'A quiet month so far. No pressure — your diary will still be here.'}
      </p>
      {j.daysSinceLast !== null && j.daysSinceLast > 3 && j.daysThisMonth > 0 && (
        <p className="mt-1 text-muted">It’s been a few days. No pressure. Your diary will still be here.</p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Tile value={j.daysWritten} label={j.daysWritten === 1 ? 'day you’ve written' : 'days you’ve written'} note={j.firstDay ? `since ${formatDate(j.firstDay)}` : ''} />
        <Tile value={j.entriesThisMonth} label={j.entriesThisMonth === 1 ? 'page this month' : 'pages this month'} note="every one counts" />
        <Tile value={j.words.toLocaleString()} label="words set down" note="that’s a lot of feelings, held" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="paper rounded-[1.8rem] p-5 sm:p-6" aria-labelledby="quilt-title">
          <h2 id="quilt-title" className="font-display text-xl font-semibold">
            Mood history
          </h2>
          <p className="text-sm text-muted">The last five weeks, like a little quilt. Empty squares are just rest.</p>
          <ol className="mt-4 grid grid-cols-7 gap-1.5">
            {quilt.map(({ key, entry }) => {
              const label = `${formatDate(key)}: ${entry ? (entry.kind === 'vent' ? 'vent' : entry.mood ? MOOD_BY_ID[entry.mood].label : entry.customMood || 'a page') : 'no page'}`
              return (
                <li key={key} className="aspect-square">
                  {entry ? (
                    <a
                      href={href(`entry/${entry.id}`)}
                      title={label}
                      aria-label={label}
                      className="grid h-full place-items-center rounded-xl bg-accent-soft/70 text-lg transition hover:scale-105 hover:bg-accent-soft"
                    >
                      <span aria-hidden="true">{entry.kind === 'vent' ? '💨' : entry.kind === 'checkin' ? '🌙' : moodEmoji(entry.mood, entry.customMood)}</span>
                    </a>
                  ) : (
                    <span title={label} className="block h-full rounded-xl border border-dashed border-line">
                      <span className="sr-only">{label}</span>
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </section>

        <section className="paper rounded-[1.8rem] p-5 sm:p-6" aria-labelledby="moods-title">
          <h2 id="moods-title" className="font-display text-xl font-semibold">
            Most common moods
          </h2>
          <p className="text-sm text-muted">Not good or bad. Just what’s been passing through.</p>
          {j.topMoods.length ? (
            <Bars
              items={j.topMoods.map((m) => ({ label: MOOD_BY_ID[m.mood].label, prefix: MOOD_BY_ID[m.mood].emoji, value: m.count }))}
              unit="page"
            />
          ) : (
            <p className="mt-4 text-muted">No moods picked yet — that’s fine too.</p>
          )}
        </section>

        <section className="paper rounded-[1.8rem] p-5 sm:p-6" aria-labelledby="days-title">
          <h2 id="days-title" className="font-display text-xl font-semibold">
            Favorite writing days
          </h2>
          <p className="text-sm text-muted">{favDay >= 0 ? `You seem to find your way here most on ${weekdayNames('long')[favDay]}s.` : ''}</p>
          <Bars items={names.map((n, i) => ({ label: n, value: j.weekdays[i] }))} unit="page" />
        </section>

        <section className="paper rounded-[1.8rem] p-5 sm:p-6" aria-labelledby="time-title">
          <h2 id="time-title" className="font-display text-xl font-semibold">
            When you write
          </h2>
          <p className="text-sm text-muted">
            {favTime === 3 ? 'A night owl. The quiet hours are good for honest pages.' : favTime >= 0 ? `Mostly in the ${times[favTime].toLowerCase()}.` : ''}
          </p>
          <Bars items={times.map((t, i) => ({ label: t, value: j.timesOfDay[i] }))} unit="page" />
        </section>
      </div>
    </div>
  )
}

function Tile({ value, label, note }: { value: number | string; label: string; note: string }) {
  return (
    <div className="paper rounded-[1.6rem] p-5">
      <p className="font-display text-4xl font-semibold">{value}</p>
      <p className="mt-1 font-semibold">{label}</p>
      {note && <p className="hand text-xl text-muted">{note}</p>}
    </div>
  )
}

/** One hue, labels and counts in ink, so nothing depends on colour alone. */
function Bars({ items, unit }: { items: { label: string; value: number; prefix?: string }[]; unit: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="mt-4 space-y-2">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-sm" title={`${i.label}: ${i.value} ${unit}${i.value === 1 ? '' : 's'}`}>
          <span className="truncate">
            {i.prefix && <span aria-hidden="true">{i.prefix} </span>}
            {i.label}
          </span>
          <span className="h-3 rounded-full bg-line/60" aria-hidden="true">
            <span className="block h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${(i.value / max) * 100}%`, minWidth: i.value ? 6 : 0 }} />
          </span>
          <span className="text-right tabular-nums text-muted">
            {i.value}
            <span className="sr-only"> {unit}s</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
