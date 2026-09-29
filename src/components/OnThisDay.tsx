import { formatDate } from '../lib/dates'
import { moodEmoji } from '../lib/moods'
import { excerpt } from '../lib/stats'
import type { Entry } from '../lib/types'
import { href } from '../state/router'

/** Like finding an old letter from yourself tucked into a drawer. */
export function OnThisDay({ entries }: { entries: Entry[] }) {
  if (!entries.length) return null
  return (
    <section aria-labelledby="otd-title" className="rise">
      <h2 id="otd-title" className="hand text-3xl text-ink">
        You were here on this day…
      </h2>
      <div className="mt-3 space-y-4">
        {entries.slice(0, 3).map((e, i) => (
          <a
            key={e.id}
            href={href(`entry/${e.id}`)}
            className="letter group relative block rounded-[1.2rem] p-5 pl-6 transition duration-500 hover:-rotate-0 sm:p-6"
            style={{ rotate: `${i % 2 ? 0.6 : -0.8}deg` }}
          >
            <span aria-hidden="true" className="letter-stamp">
              {moodEmoji(e.mood, e.customMood)}
            </span>
            <p className="hand text-2xl leading-tight">{formatDate(e.date)}</p>
            <p className="mt-0.5 text-sm text-muted">
              {new Date().getFullYear() - Number(e.date.slice(0, 4)) === 1
                ? 'A year ago, you wrote this…'
                : `${new Date().getFullYear() - Number(e.date.slice(0, 4))} years ago, you wrote this…`}
            </p>
            <p className="font-write mt-3 line-clamp-4 italic leading-relaxed">“{excerpt(e, 220) || '…'}”</p>
            <span className="mt-3 inline-block text-sm font-bold text-accent group-hover:underline">Read the whole page →</span>
          </a>
        ))}
      </div>
    </section>
  )
}
