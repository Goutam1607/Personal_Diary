import { useEffect, useMemo, useState } from 'react'
import { Calendar } from '../components/Calendar'
import { EntryCard } from '../components/EntryCard'
import { Icon, type IconName } from '../components/ui/Icon'
import { dayKey, formatLongDate, monthLabel, parseDay } from '../lib/dates'
import { MOODS } from '../lib/moods'
import { searchEntries } from '../lib/stats'
import type { MoodId } from '../lib/types'
import { useAtmosphere } from '../state/atmosphere'
import { href, navigate } from '../state/router'
import { useVault } from '../state/vault'

type View = 'calendar' | 'timeline' | 'favorites'

const VIEWS: { id: View; label: string; icon: IconName }[] = [
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'timeline', label: 'Timeline', icon: 'list' },
  { id: 'favorites', label: 'Favorite memories', icon: 'heart' },
]

export function Memories({ params }: { params: URLSearchParams }) {
  const { entries } = useVault()
  const { setMood } = useAtmosphere()
  const view = (params.get('view') as View) || 'calendar'
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [mood, setMoodFilter] = useState<MoodId | null>(null)
  const now = new Date()
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth()])
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => setMood(null), [setMood])

  const allTags = useMemo(() => [...new Set(entries.flatMap((e) => e.tags))].sort(), [entries])
  const usedMoods = useMemo(() => MOODS.filter((m) => entries.some((e) => e.mood === m.id)), [entries])

  const filtered = useMemo(() => {
    let list = searchEntries(entries, query)
    if (tag) list = list.filter((e) => e.tags.includes(tag))
    if (mood) list = list.filter((e) => e.mood === mood)
    if (view === 'favorites') list = list.filter((e) => e.favorite)
    return list
  }, [entries, query, tag, mood, view])

  const filtering = !!(query || tag || mood)
  const selectedEntries = selected ? filtered.filter((e) => e.date === selected) : []

  const byMonth = useMemo(() => {
    const groups = new Map<string, typeof filtered>()
    for (const e of [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))) {
      const k = e.date.slice(0, 7)
      groups.set(k, [...(groups.get(k) ?? []), e])
    }
    return [...groups.entries()]
  }, [filtered])

  const random = () => {
    const pool = entries.filter((e) => e.kind !== 'checkin')
    const pick = pool[Math.floor(Math.random() * pool.length)]
    if (pick) navigate(`entry/${pick.id}?capsule=1`)
  }

  const selectDay = (day: string) => {
    const list = filtered.filter((e) => e.date === day)
    if (list.length === 1 && !filtering) navigate(`entry/${list[0].id}`)
    else setSelected(day)
  }

  return (
    <div className="page-enter pt-4 sm:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Little memories</h1>
          <p className="hand mt-1 text-2xl text-muted">
            {entries.length ? `${entries.length} ${entries.length === 1 ? 'page' : 'pages'} of you, kept safe.` : 'Nothing here yet — and that’s okay.'}
          </p>
        </div>
        <button type="button" className="btn btn-soft" onClick={random} disabled={!entries.length}>
          Show me a random memory ✨
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div role="tablist" aria-label="How to browse" className="paper flex w-fit gap-1 rounded-full p-1">
          {VIEWS.map((v) => (
            <a
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              href={href(`memories?view=${v.id}`)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold transition sm:px-4 ${
                view === v.id ? 'bg-accent-soft text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              <Icon name={v.icon} size={16} filled={v.id === 'favorites' && view === v.id} />
              <span className={v.id === 'favorites' ? 'hidden sm:inline' : ''}>{v.label}</span>
              {v.id === 'favorites' && <span className="sm:hidden">Favorites</span>}
            </a>
          ))}
        </div>
        <div className="relative flex-1 lg:max-w-sm lg:ml-auto">
          <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <label htmlFor="search" className="sr-only">
            Search your diary
          </label>
          <input
            id="search"
            type="search"
            className="field !rounded-full !pl-10"
            placeholder="Search your words…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {(usedMoods.length > 0 || allTags.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter">
          {usedMoods.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mood === m.id}
              onClick={() => setMoodFilter(mood === m.id ? null : m.id)}
              className={`rounded-full border px-2.5 py-1 text-sm transition ${mood === m.id ? 'border-accent bg-accent-soft' : 'border-line text-muted hover:text-ink'}`}
            >
              <span aria-hidden="true">{m.emoji}</span> {m.label}
            </button>
          ))}
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tag === t}
              onClick={() => setTag(tag === t ? null : t)}
              className={`rounded-full border border-dashed px-2.5 py-1 text-sm transition ${tag === t ? 'border-accent bg-accent-soft' : 'border-line text-muted hover:text-ink'}`}
            >
              {t}
            </button>
          ))}
          {filtering && (
            <button
              type="button"
              className="px-2 text-sm font-bold text-accent underline"
              onClick={() => {
                setQuery('')
                setTag(null)
                setMoodFilter(null)
              }}
            >
              clear
            </button>
          )}
        </div>
      )}

      <div className="mt-6">
        {view === 'calendar' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <Calendar
              entries={filtered}
              year={ym[0]}
              month={ym[1]}
              selected={selected}
              onMonth={(y, m) => {
                setYm([y, m])
                setSelected(null)
              }}
              onSelect={selectDay}
            />
            <div aria-live="polite">
              {selected ? (
                <div className="space-y-3">
                  <h2 className="hand text-3xl">{formatLongDate(selected)}</h2>
                  {selectedEntries.length ? (
                    selectedEntries.map((e) => <EntryCard key={e.id} entry={e} showDate={false} />)
                  ) : (
                    <div className="rounded-[1.4rem] border border-dashed border-line p-5">
                      <p className="text-muted">No pages on this day.</p>
                      {selected <= dayKey() && (
                        <a href={href(`write?date=${selected}`)} className="btn btn-soft mt-3 text-sm">
                          Write something for this day
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <MonthMoods entries={filtered} year={ym[0]} month={ym[1]} />
              )}
            </div>
          </div>
        )}

        {view !== 'calendar' &&
          (byMonth.length ? (
            <div className="space-y-8">
              {byMonth.map(([month, list]) => {
                const d = parseDay(`${month}-01`)
                return (
                  <section key={month} aria-label={monthLabel(d.getFullYear(), d.getMonth())}>
                    <h2 className="hand sticky top-16 z-10 mb-3 w-fit rounded-full bg-veil px-3 text-3xl backdrop-blur">
                      {monthLabel(d.getFullYear(), d.getMonth())}
                    </h2>
                    <div className="grid gap-3 md:grid-cols-2">
                      {list.map((e) => (
                        <EntryCard key={e.id} entry={e} />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          ) : (
            <EmptyState view={view} filtering={filtering} />
          ))}
      </div>
    </div>
  )
}

function MonthMoods({ entries, year, month }: { entries: ReturnType<typeof useVault>['entries']; year: number; month: number }) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const list = entries.filter((e) => e.date.startsWith(prefix) && e.kind !== 'checkin').sort((a, b) => a.date.localeCompare(b.date))
  if (!list.length)
    return (
      <div className="rounded-[1.4rem] border border-dashed border-line p-6 text-center">
        <p className="hand text-2xl">A quiet month.</p>
        <p className="mt-1 text-sm text-muted">No pressure. Your diary will still be here.</p>
      </div>
    )
  return (
    <div>
      <h2 className="hand text-3xl">This month’s moods</h2>
      <ul className="mt-3 space-y-1.5">
        {list.map((e) => (
          <li key={e.id}>
            <a href={href(`entry/${e.id}`)} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-accent-soft/50">
              <span className="w-28 shrink-0 text-sm text-muted">
                {parseDay(e.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
              </span>
              <span aria-hidden="true" className="text-lg">
                {e.kind === 'vent' ? '💨' : e.mood ? MOODS.find((m) => m.id === e.mood)?.emoji : e.customMood ? '🌿' : '·'}
              </span>
              <span className="truncate text-sm">{e.kind === 'vent' ? 'Vent' : e.customMood || MOODS.find((m) => m.id === e.mood)?.label || 'A page'}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EmptyState({ view, filtering }: { view: View; filtering: boolean }) {
  return (
    <div className="rounded-[1.6rem] border border-dashed border-line px-6 py-12 text-center">
      <p className="hand text-3xl">
        {filtering ? 'Nothing matches that.' : view === 'favorites' ? 'No kept pages yet.' : 'Your memories will gather here.'}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-muted">
        {filtering
          ? 'Try other words, or clear the filters.'
          : view === 'favorites'
            ? 'When a page feels special, tap “Keep this one” and it will wait for you here.'
            : 'Every page you write becomes a little memory you can come back to.'}
      </p>
    </div>
  )
}
