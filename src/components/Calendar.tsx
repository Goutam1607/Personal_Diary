import { useMemo } from 'react'
import { dayKey, monthLabel, weekdayNames } from '../lib/dates'
import { moodEmoji } from '../lib/moods'
import type { Entry } from '../lib/types'
import { Icon } from './ui/Icon'

interface Props {
  entries: Entry[]
  year: number
  month: number
  selected: string | null
  onMonth: (year: number, month: number) => void
  onSelect: (day: string) => void
}

export function Calendar({ entries, year, month, selected, onMonth, onSelect }: Props) {
  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>()
    for (const e of entries) m.set(e.date, [...(m.get(e.date) ?? []), e])
    return m
  }, [entries])

  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const lead = first.getDay()
  const today = dayKey()
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => dayKey(new Date(year, month, i + 1))),
  ]
  const names = weekdayNames()

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1)
    onMonth(d.getFullYear(), d.getMonth())
  }

  return (
    <div className="paper rounded-[1.8rem] p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <button type="button" className="btn btn-ghost !min-h-10 !px-3" onClick={() => shift(-1)}>
          <Icon name="back" size={18} />
          <span className="sr-only">Previous month</span>
        </button>
        <h2 className="font-display text-xl font-semibold" aria-live="polite">
          {monthLabel(year, month)}
        </h2>
        <button type="button" className="btn btn-ghost !min-h-10 !px-3" onClick={() => shift(1)}>
          <Icon name="forward" size={18} />
          <span className="sr-only">Next month</span>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        <div className="contents">
          {names.map((n) => (
            <div key={n} aria-hidden="true" className="pb-1 text-center text-xs font-bold text-muted">
              {n}
            </div>
          ))}
        </div>
        <div className="contents">
          {cells.map((day, i) => {
            if (!day) return <div key={`b${i}`} />
            const list = byDay.get(day) ?? []
            const main = list.find((e) => e.kind === 'entry') ?? list[0]
            const isToday = day === today
            const isSel = day === selected
            const n = Number(day.slice(8))
            const label = `${new Date(year, month, n).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}${
              list.length ? `, ${list.length} ${list.length === 1 ? 'page' : 'pages'}` : ''
            }`
            return (
              <div key={day}>
                <button
                  type="button"
                  onClick={() => onSelect(day)}
                  aria-label={label}
                  aria-pressed={isSel}
                  className={`flex aspect-square w-full flex-col items-center justify-center rounded-2xl text-sm transition ${
                    isSel ? 'bg-accent text-white night:text-[#231d33]' : list.length ? 'bg-accent-soft/60 hover:bg-accent-soft' : 'hover:bg-accent-soft/40'
                  } ${isToday && !isSel ? 'ring-2 ring-accent/60' : ''}`}
                >
                  <span className={`text-xs font-bold leading-none ${list.length ? '' : 'text-muted'}`}>{n}</span>
                  {main && (
                    <span aria-hidden="true" className="mt-0.5 text-base leading-none sm:text-lg">
                      {main.kind === 'vent' ? '💨' : main.kind === 'checkin' ? '🌙' : moodEmoji(main.mood, main.customMood)}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
