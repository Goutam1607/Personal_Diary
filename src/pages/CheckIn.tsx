import { useState } from 'react'
import { Companion } from '../components/companion/Companion'
import { AutoTextarea } from '../components/ui/AutoTextarea'
import { Icon } from '../components/ui/Icon'
import { dayKey } from '../lib/dates'
import { newEntry } from '../lib/entries'
import type { CheckIn as CheckInData, Entry } from '../lib/types'
import { href, navigate } from '../state/router'
import { useSettings } from '../state/settings'
import { useToday } from '../state/useToday'
import { useVault } from '../state/vault'
import { hasContent } from '../lib/entries'

const DAY_WORDS = ['Really hard', 'Not great', 'Somewhere in between', 'Pretty good', 'Lovely']
const ENERGY_WORDS = ['Running on empty', 'Low', 'Okay-ish', 'Good', 'Full']

/** "Before you go…" — everything here is optional. */
export function CheckIn({ id }: { id?: string }) {
  const { entries, save } = useVault()
  const { settings } = useSettings()
  const today = useToday()
  const existing = id ? entries.find((e) => e.id === id) : entries.find((e) => e.kind === 'checkin' && e.date === dayKey())
  const [entry] = useState<Entry>(() => existing ?? newEntry('checkin', today.mood, today.customMood))
  const [data, setData] = useState<CheckInData>(existing?.checkin ?? {})
  const [done, setDone] = useState(false)

  const finish = async () => {
    const next = { ...entry, checkin: data, updatedAt: new Date().toISOString() }
    if (hasContent(next)) await save(next)
    setDone(true)
  }

  if (done) {
    const late = new Date().getHours() >= 20 || new Date().getHours() < 5
    return (
      <div className="page-enter flex min-h-[70vh] flex-col items-center justify-center text-center">
        <Companion kind={settings.companion} face={late ? 'sleepy' : 'content'} pose={late ? 'sleepy' : 'heart'} size={170} />
        <p className="hand mt-4 text-4xl">{late ? 'Sleep well. 🤍' : 'Take care of yourself today. 🤍'}</p>
        <a href={href('')} className="btn btn-primary mt-8">
          Back to my corner
        </a>
      </div>
    )
  }

  return (
    <div className="page-enter mx-auto max-w-xl pt-4 sm:pt-10">
      <a href={href('')} className="btn btn-ghost mb-3 !px-3 text-sm">
        <Icon name="back" size={18} /> Home
      </a>
      <div className="paper rounded-[2rem] p-6 sm:p-9">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Before you go…</h1>
        <p className="mt-1 text-muted">Everything here is optional. Skip whatever you like.</p>

        <fieldset className="mt-7">
          <legend className="hand text-2xl">How was today?</legend>
          <Scale value={data.day} onChange={(day) => setData((d) => ({ ...d, day }))} words={DAY_WORDS} symbol="★" name="day" />
        </fieldset>

        <fieldset className="mt-6">
          <legend className="hand text-2xl">Energy</legend>
          <Scale value={data.energy} onChange={(energy) => setData((d) => ({ ...d, energy }))} words={ENERGY_WORDS} symbol="🔋" name="energy" />
        </fieldset>

        <div className="mt-6">
          <label htmlFor="onmind" className="hand block text-2xl">
            What is sitting on your mind?
          </label>
          <AutoTextarea
            id="onmind"
            minRows={3}
            className="field font-write mt-2 text-[1.08rem] leading-relaxed"
            value={data.onMind ?? ''}
            onChange={(e) => setData((d) => ({ ...d, onMind: e.target.value }))}
          />
        </div>

        <div className="mt-7 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('')}>
            Not tonight
          </button>
          <button type="button" className="btn btn-primary" onClick={finish}>
            Okay, that’s it
          </button>
        </div>
      </div>
    </div>
  )
}

function Scale({ value, onChange, words, symbol, name }: { value?: number; onChange: (v?: number) => void; words: string[]; symbol: string; name: string }) {
  return (
    <div>
      <div className="mt-2 flex gap-1.5">
        {words.map((w, i) => {
          const n = i + 1
          const on = !!value && n <= value
          return (
            <label key={n} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                onClick={() => value === n && onChange(undefined)}
                className="peer sr-only"
                aria-label={`${n} of 5 — ${w}`}
              />
              <span
                aria-hidden="true"
                className={`grid size-11 place-items-center rounded-2xl text-xl transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${
                  on ? 'scale-105 bg-accent-soft' : 'bg-line/40 opacity-50 grayscale hover:opacity-80'
                } ${symbol === '★' && on ? 'text-accent' : ''}`}
              >
                {symbol}
              </span>
            </label>
          )
        })}
      </div>
      <p className="mt-1.5 min-h-5 text-sm text-muted">{value ? words[value - 1] : ''}</p>
    </div>
  )
}
