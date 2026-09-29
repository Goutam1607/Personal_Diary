import { useEffect, useMemo, useRef } from 'react'
import { EntryCard } from '../components/EntryCard'
import { MoodPicker } from '../components/MoodPicker'
import { OnThisDay } from '../components/OnThisDay'
import { RoomScene } from '../components/scene/RoomScene'
import { Icon } from '../components/ui/Icon'
import { dayKey, greeting } from '../lib/dates'
import { moodOf } from '../lib/moods'
import { onThisDay } from '../lib/stats'
import { useAtmosphere } from '../state/atmosphere'
import { href, navigate } from '../state/router'
import { useSettings } from '../state/settings'
import { useToday } from '../state/useToday'
import { useVault } from '../state/vault'

const LATE_SUBTITLES = ['That’s okay. The quiet hours are good for honest pages.', 'The night is soft here.', 'Come in, get comfy.']
const SUBTITLES = ['Welcome back 🤍', 'I saved your spot.', 'Come in, get comfy.', 'This page has been waiting for you.', 'Hi. It’s just us here.']

// Only greet with a wave once per unlock, not every time you come back to this page.
let greeted = false
export function resetGreeting() {
  greeted = false
}

export function Home() {
  const { entries, privateSettings } = useVault()
  const { settings, night } = useSettings()
  const { mood, customMood, setTodayMood } = useToday()
  const { setMood } = useAtmosphere()
  const greet = useRef(!greeted)
  greeted = true

  useEffect(() => setMood(mood), [mood, setMood])

  const today = dayKey()
  const todays = entries.filter((e) => e.date === today && e.kind === 'entry')
  const memories = useMemo(() => onThisDay(entries, today), [entries, today])
  const recent = entries.filter((e) => e.kind !== 'checkin').slice(0, 3)
  const m = moodOf(mood)
  const name = privateSettings.name
  const hour = new Date().getHours()
  const pool = hour < 4 || hour >= 22 ? LATE_SUBTITLES : SUBTITLES
  const subtitle = pool[new Date().getDate() % pool.length]

  const randomMemory = () => {
    const pool = entries.filter((e) => e.kind !== 'checkin' && e.date !== today)
    const pick = (pool.length ? pool : entries)[Math.floor(Math.random() * (pool.length || entries.length))]
    if (pick) navigate(`entry/${pick.id}?capsule=1`)
  }

  return (
    <div className="page-enter pt-4 sm:pt-8">
      <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        {/* left: the little room */}
        <section aria-label="Your companion" className="flex flex-col items-center lg:sticky lg:top-24">
          <div className="text-center lg:self-start lg:text-left">
            <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight sm:text-5xl">
              {greeting(name)}
            </h1>
            <p className="hand mt-1 text-2xl text-muted sm:text-[1.7rem]">{subtitle}</p>
          </div>
          <RoomScene mood={m} kind={settings.companion} night={night} greet={greet.current} className="mt-2 max-w-[330px] sm:mt-6 sm:max-w-[420px]" />
          <p className="hand mt-3 min-h-8 text-center text-2xl text-ink/80" aria-live="polite">
            {mood ? m.whisper : customMood ? 'Thank you for telling me. It all counts.' : ''}
          </p>
        </section>

        {/* right: how are you, and places to go */}
        <div className="space-y-8">
          <section aria-labelledby="mood-q" className="paper rounded-[2rem] p-5 sm:p-7">
            <h2 id="mood-q" className="font-display text-2xl font-semibold tracking-tight">
              How are you feeling today?
            </h2>
            <p className="mt-1 text-sm text-muted">Whatever it is, it’s allowed here.</p>
            <div className="mt-5">
              <MoodPicker value={mood} custom={customMood} onChange={(id, custom) => setTodayMood(id, custom)} />
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href={href(todays.length ? `write/${todays[0].id}` : 'write')} className="btn btn-primary text-[1.05rem]">
                <Icon name="pen" />
                {todays.length ? 'Keep writing today’s story' : 'Write today’s little story'}
              </a>
              {todays.length > 0 && (
                <a href={href('write?fresh=1')} className="btn btn-ghost text-sm">
                  or start a new page
                </a>
              )}
            </div>
          </section>

          <section aria-label="Other ways to write" className="grid gap-3 sm:grid-cols-2">
            <a href={href('vent')} className="soft-tile">
              <span aria-hidden="true" className="text-2xl">
                💨
              </span>
              <span>
                <strong>I just need to vent.</strong>
                <span className="block text-sm text-muted">No questions. Just a page.</span>
              </span>
            </a>
            <a href={href('write?prompt=1')} className="soft-tile">
              <span aria-hidden="true" className="text-2xl">
                💭
              </span>
              <span>
                <strong>I don’t know what to write</strong>
                <span className="block text-sm text-muted">A gentle question to start with.</span>
              </span>
            </a>
            <button type="button" onClick={randomMemory} disabled={!entries.length} className="soft-tile text-left disabled:opacity-60">
              <span aria-hidden="true" className="text-2xl">
                ✨
              </span>
              <span>
                <strong>Show me a random memory</strong>
                <span className="block text-sm text-muted">{entries.length ? 'Open a tiny time capsule.' : 'Your memories will gather here.'}</span>
              </span>
            </button>
            <a href={href('checkin')} className="soft-tile">
              <span aria-hidden="true" className="text-2xl">
                🌙
              </span>
              <span>
                <strong>Before you go…</strong>
                <span className="block text-sm text-muted">A tiny check-in, if you like.</span>
              </span>
            </a>
          </section>

          <OnThisDay entries={memories} />

          {recent.length > 0 ? (
            <section aria-labelledby="recent-title">
              <div className="flex items-baseline justify-between">
                <h2 id="recent-title" className="hand text-3xl">
                  Lately…
                </h2>
                <a href={href('memories')} className="text-sm font-bold text-accent hover:underline">
                  All little memories →
                </a>
              </div>
              <div className="mt-3 space-y-3">
                {recent.map((e) => (
                  <EntryCard key={e.id} entry={e} />
                ))}
              </div>
            </section>
          ) : (
            <section className="rounded-[1.6rem] border border-dashed border-line p-6 text-center">
              <p className="hand text-2xl">Your first page is waiting.</p>
              <p className="mt-1 text-sm text-muted">It doesn’t need to be good, or long, or make sense. It just needs to be yours.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
