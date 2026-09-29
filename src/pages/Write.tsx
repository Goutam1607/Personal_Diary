import { useEffect, useMemo, useRef, useState } from 'react'
import { Celebrate } from '../components/Celebrate'
import { Companion } from '../components/companion/Companion'
import { MoodPicker } from '../components/MoodPicker'
import { TagPicker } from '../components/TagPicker'
import { AutoTextarea } from '../components/ui/AutoTextarea'
import { Dialog } from '../components/ui/Dialog'
import { Icon } from '../components/ui/Icon'
import { useToast } from '../components/ui/Toast'
import { dayKey, formatLongDate, formatTime } from '../lib/dates'
import { newEntry } from '../lib/entries'
import { moodOf, moodEmoji, moodLabel } from '../lib/moods'
import { pickPrompt } from '../lib/prompts'
import type { Entry, MoodId } from '../lib/types'
import { useAtmosphere } from '../state/atmosphere'
import { href, navigate, pageAliases } from '../state/router'
import { useSettings } from '../state/settings'
import { useAutosave } from '../state/useAutosave'
import { useToday } from '../state/useToday'
import { useVault } from '../state/vault'

const BRIGHT: MoodId[] = ['happy', 'loved', 'excited', 'peaceful']

function closingLine(mood: MoodId | null): string {
  switch (mood) {
    case 'happy':
    case 'excited':
    case 'loved':
      return 'Saved, so you can come back to this feeling. 🤍'
    case 'sad':
    case 'lonely':
    case 'emotional':
      return 'Okay. You got some of it out. That’s enough for today.'
    case 'angry':
      return 'It’s on the page now, not only in you.'
    case 'overwhelmed':
    case 'stressed':
      return 'Set down, for now. You can pick it up later — or not.'
    case 'tired':
      return 'Tucked away. Go rest.'
    default:
      return 'Tucked away safely. 🤍'
  }
}

export function Write({ id, params, instanceKey }: { id?: string; params: URLSearchParams; instanceKey: string }) {
  const { entries, remove, privateSettings, updatePrivate } = useVault()
  const { settings, motion } = useSettings()
  const today = useToday()
  const { setMood, setWriting } = useAtmosphere()
  const toast = useToast()

  const existing = id ? entries.find((e) => e.id === id) : undefined
  const [entry, setEntry] = useState<Entry>(() => {
    if (existing) return existing
    const date = params.get('date') || dayKey()
    return newEntry('entry', date === dayKey() ? today.mood : null, date === dayKey() ? today.customMood : undefined, date)
  })
  const { status, flush, discard, isSaved } = useAutosave(entry, !!existing)

  const [askMood, setAskMood] = useState(!existing && !entry.mood && !entry.customMood)
  const [prompt, setPrompt] = useState<string | null>(() => (params.get('prompt') ? pickPrompt(entry.mood) : null))
  const [showUnsaid, setShowUnsaid] = useState(!!entry.unsaid)
  const [showGood, setShowGood] = useState(!!entry.goodThing)
  const [showTags, setShowTags] = useState(entry.tags.length > 0)
  const [editingDate, setEditingDate] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [finished, setFinished] = useState(false)
  const [burst, setBurst] = useState<null | 'hearts' | 'sparkles'>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const mood = moodOf(entry.mood)

  // The room takes on this entry's mood; effects dim while writing.
  useEffect(() => {
    setMood(entry.mood)
  }, [entry.mood, setMood])
  useEffect(() => {
    setWriting(true)
    return () => setWriting(false)
  }, [setWriting])

  // Once saved, give the page a real address so a reload or unlock brings you back here.
  useEffect(() => {
    if (!id && status === 'saved') {
      pageAliases.set(entry.id, instanceKey)
      navigate(`write/${entry.id}`, { replace: true })
    }
  }, [id, status, entry.id, instanceKey])

  useEffect(() => {
    if (!askMood) bodyRef.current?.focus({ preventScroll: true })
  }, [askMood])

  const patch = (p: Partial<Entry>) => setEntry((e) => ({ ...e, ...p }))

  const chooseMood = (m: MoodId | null, custom?: string) => {
    patch({ mood: m, customMood: custom })
    if (entry.date === dayKey()) void today.setTodayMood(m, custom)
    setAskMood(false)
  }

  const toggleFavorite = () => {
    patch({ favorite: !entry.favorite })
    if (!entry.favorite) {
      setBurst('sparkles')
      setTimeout(() => setBurst(null), 2200)
    }
  }

  const finish = async () => {
    await flush()
    if (!isSaved()) {
      navigate('')
      return
    }
    if (entry.mood && BRIGHT.includes(entry.mood) && motion) {
      setBurst('hearts')
      setTimeout(() => setBurst(null), 2600)
    }
    setFinished(true)
  }

  const doDelete = async () => {
    setConfirmDelete(false)
    discard()
    await remove(entry.id)
    toast('Gone. 🍃')
    navigate('', { replace: true })
  }

  const statusText = useMemo(() => {
    if (status === 'saving') return 'Saving…'
    if (status === 'saved') return 'Saved · encrypted on this device'
    if (status === 'error') return 'Couldn’t save just now — I’ll keep trying'
    return 'Nothing saved until you write something'
  }, [status])

  if (finished) {
    return (
      <div className="page-enter flex min-h-[70vh] flex-col items-center justify-center text-center">
        {burst && <Celebrate kind={burst} />}
        <Companion kind={settings.companion} face={mood.calm ? 'soft' : 'content'} pose={mood.calm ? 'blanket' : 'heart'} size={170} />
        <p className="hand mt-4 max-w-md text-3xl leading-snug">{closingLine(entry.mood)}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href={href('')} className="btn btn-primary">
            Back to my corner
          </a>
          <a href={href('checkin')} className="btn btn-soft">
            🌙 Before you go…
          </a>
          <a href={href(`entry/${entry.id}`)} className="btn btn-ghost">
            Read it again
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter relative mx-auto max-w-3xl pt-2 sm:pt-6">
      {burst && <Celebrate kind={burst} count={10} />}

      {/* the companion sits quietly beside the page, never on top of it */}
      <div className="pointer-events-none absolute -left-44 bottom-24 hidden xl:block" aria-hidden="true">
        <Companion kind={settings.companion} face={mood.face} pose={mood.pose === 'wave' ? 'read' : mood.pose} size={150} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <a href={href('')} className="btn btn-ghost !px-3 text-sm">
          <Icon name="back" size={18} /> Home
        </a>
        <p className="text-xs text-muted" role="status" aria-live="polite">
          {statusText}
        </p>
      </div>

      <article className="paper relative rounded-[2rem] px-5 pb-6 pt-6 sm:px-10 sm:pb-10 sm:pt-9">
        <div className="pointer-events-none absolute -top-10 right-4 xl:hidden" aria-hidden="true">
          <Companion kind={settings.companion} face={mood.face} pose={mood.pose === 'wave' ? 'read' : mood.pose} size={76} />
        </div>

        <header>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {entry.date === dayKey() ? 'Today’s little story' : 'A little story'}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {editingDate ? (
              <input
                type="date"
                className="field !w-auto !py-1 text-sm"
                value={entry.date}
                max={dayKey()}
                autoFocus
                aria-label="Which day is this page for?"
                onChange={(e) => e.target.value && patch({ date: e.target.value })}
                onBlur={() => setEditingDate(false)}
              />
            ) : (
              <button type="button" className="underline decoration-dotted underline-offset-4 hover:text-ink" onClick={() => setEditingDate(true)} title="Change the day">
                {formatLongDate(entry.date)}
              </button>
            )}
            <span aria-hidden="true">·</span>
            <span>{formatTime(entry.createdAt)}</span>
            {!askMood && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setAskMood(true)}
                  className="rounded-full bg-accent-soft/80 px-3 py-0.5 font-semibold text-ink hover:bg-accent-soft"
                  title="Change mood"
                  aria-label={entry.mood || entry.customMood ? `Mood: ${moodLabel(entry.mood, entry.customMood)}. Change mood` : 'Add a mood'}
                >
                  {entry.mood || entry.customMood ? `${moodEmoji(entry.mood, entry.customMood)} ${moodLabel(entry.mood, entry.customMood)}` : '+ mood'}
                </button>
              </>
            )}
          </div>
        </header>

        {askMood && (
          <section aria-labelledby="write-mood-q" className="rise mt-6 rounded-3xl bg-accent-soft/35 p-4 sm:p-5">
            <h2 id="write-mood-q" className="hand text-2xl">
              How are you feeling today?
            </h2>
            <div className="mt-3">
              <MoodPicker compact value={entry.mood} custom={entry.customMood} onChange={chooseMood} />
            </div>
            <button type="button" className="mt-3 text-sm text-muted underline decoration-dotted underline-offset-4 hover:text-ink" onClick={() => setAskMood(false)}>
              Skip — I just want to write
            </button>
          </section>
        )}

        {prompt && (
          <div className="rise mt-6 rounded-3xl border border-dashed border-line p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">Maybe…</p>
            <p className="font-write mt-1 text-xl italic">{prompt}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-soft !min-h-9 !py-1.5 text-sm"
                onClick={() => {
                  patch({ prompt })
                  setPrompt(null)
                  bodyRef.current?.focus()
                }}
              >
                Write about this
              </button>
              <button type="button" className="btn btn-ghost !min-h-9 !py-1.5 text-sm" onClick={() => setPrompt(pickPrompt(entry.mood, prompt))}>
                <Icon name="shuffle" size={16} /> Another one
              </button>
              <button type="button" className="btn btn-ghost !min-h-9 !py-1.5 text-sm" onClick={() => setPrompt(null)}>
                No thanks
              </button>
            </div>
          </div>
        )}

        {entry.prompt && (
          <p className="font-write mt-6 flex items-start gap-2 text-lg italic text-muted">
            <span className="flex-1">{entry.prompt}</span>
            <button type="button" className="text-xs not-italic underline decoration-dotted" onClick={() => patch({ prompt: undefined })}>
              remove
            </button>
          </p>
        )}

        <label htmlFor="entry-body" className="sr-only">
          Your entry
        </label>
        <AutoTextarea
          ref={bodyRef}
          id="entry-body"
          minRows={10}
          value={entry.body}
          onChange={(e) => patch({ body: e.target.value })}
          placeholder={entry.mood || entry.customMood ? mood.placeholder : 'Write whatever you want. This page is only yours.'}
          className="font-write lined mt-5 block min-h-[45vh] w-full bg-transparent text-[1.15rem] text-ink placeholder:text-muted/70 focus:outline-none sm:text-[1.2rem]"
          spellCheck
        />

        {!entry.body && !prompt && !entry.prompt && (
          <button type="button" className="mt-1 text-sm text-muted underline decoration-dotted underline-offset-4 hover:text-ink" onClick={() => setPrompt(pickPrompt(entry.mood))}>
            I don’t know what to write
          </button>
        )}

        {/* feelings */}
        <div className="mt-8 border-t border-line pt-5">
          {showTags ? (
            <div className="rise">
              <h2 className="mb-3 text-sm font-bold text-muted">Feelings in this page</h2>
              <TagPicker
                value={entry.tags}
                customTags={privateSettings.customTags}
                onChange={(tags) => patch({ tags })}
                onNewCustomTag={(t) => void updatePrivate({ customTags: [...privateSettings.customTags, t] })}
              />
            </div>
          ) : (
            <button type="button" className="btn btn-ghost !px-3 text-sm" onClick={() => setShowTags(true)}>
              + add feelings
            </button>
          )}
        </div>

        {/* things I couldn't say */}
        <div className="mt-6">
          {showUnsaid ? (
            <section className="sealed rise rounded-[1.4rem] p-5" aria-labelledby="unsaid-title">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="wax-seal">
                  ♥
                </span>
                <h2 id="unsaid-title" className="hand text-2xl">
                  Things I couldn’t say out loud…
                </h2>
              </div>
              <p className="mt-1 text-xs opacity-75">Just for you. It blurs when you’re not typing, in case someone’s nearby.</p>
              <label htmlFor="unsaid" className="sr-only">
                Things I couldn't say out loud
              </label>
              <AutoTextarea
                id="unsaid"
                minRows={3}
                value={entry.unsaid ?? ''}
                onChange={(e) => patch({ unsaid: e.target.value })}
                className="sealed-text font-write mt-3 block w-full bg-transparent text-[1.08rem] leading-relaxed focus:outline-none"
                placeholder="…"
              />
            </section>
          ) : (
            <button type="button" className="btn btn-ghost !px-3 text-sm" onClick={() => setShowUnsaid(true)}>
              <Icon name="lock" size={16} /> Things I couldn’t say out loud…
            </button>
          )}
        </div>

        {/* a tiny good thing — never required */}
        <div className="mt-4">
          {showGood ? (
            <section className="rise rounded-[1.4rem] bg-glow/20 p-5" aria-labelledby="good-title">
              <h2 id="good-title" className="hand text-2xl">
                A tiny good thing from today
              </h2>
              <p className="text-xs text-muted">Only if there was one. It’s okay if there wasn’t.</p>
              <label htmlFor="good" className="sr-only">
                A tiny good thing from today
              </label>
              <AutoTextarea
                id="good"
                minRows={2}
                value={entry.goodThing ?? ''}
                onChange={(e) => patch({ goodThing: e.target.value })}
                className="font-write mt-2 block w-full bg-transparent text-[1.08rem] leading-relaxed focus:outline-none"
                placeholder="a warm drink, a text, the light at 5pm…"
              />
            </section>
          ) : (
            <button type="button" className="btn btn-ghost !px-3 text-sm" onClick={() => setShowGood(true)}>
              🌼 A tiny good thing from today <span className="font-normal">(optional)</span>
            </button>
          )}
        </div>

        <footer className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-5">
          <button type="button" className={`btn ${entry.favorite ? 'btn-soft' : 'btn-ghost'}`} aria-pressed={entry.favorite} onClick={toggleFavorite}>
            <span aria-hidden="true">{entry.favorite ? '❤️' : '🤍'}</span> Keep this one
          </button>
          {isSaved() && (
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={17} /> Delete
            </button>
          )}
          <button type="button" className="btn btn-primary ml-auto" onClick={finish}>
            <Icon name="check" /> I’m done for now
          </button>
        </footer>
      </article>

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
