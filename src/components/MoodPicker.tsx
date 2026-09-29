import { useRef, useState, type KeyboardEvent } from 'react'
import { MOODS } from '../lib/moods'
import type { MoodId } from '../lib/types'

interface Props {
  value: MoodId | null
  custom?: string
  onChange: (mood: MoodId | null, custom?: string) => void
  compact?: boolean
  label?: string
}

/**
 * Mood choices as a radio group (arrow keys move between them).
 * Every mood gets the same size and the same softness — none of them is the "right" answer.
 */
export function MoodPicker({ value, custom, onChange, compact = false, label = 'How are you feeling today?' }: Props) {
  const [writingCustom, setWritingCustom] = useState(false)
  const [draft, setDraft] = useState(custom ?? '')
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const customSelected = !value && !!custom
  const selectedIndex = value ? MOODS.findIndex((m) => m.id === value) : customSelected ? MOODS.length : -1

  const onKey = (e: KeyboardEvent, i: number) => {
    const total = MOODS.length + 1
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % total
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + total) % total
    if (next < 0) return
    e.preventDefault()
    refs.current[next]?.focus()
  }

  const saveCustom = () => {
    const text = draft.trim()
    if (text) onChange(null, text)
    setWritingCustom(false)
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={label}
        className={`grid gap-2 ${compact ? 'grid-cols-4 sm:grid-cols-7' : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5'}`}
      >
        {MOODS.map((m, i) => {
          const selected = value === m.id
          return (
            <button
              key={m.id}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (selectedIndex === -1 && i === 0) ? 0 : -1}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => onChange(m.id)}
              className={`mood-chip group flex flex-col items-center justify-center gap-1 rounded-2xl border px-1 text-center transition duration-300 ${
                compact ? 'py-2' : 'py-3'
              } ${
                selected
                  ? 'border-accent bg-accent-soft shadow-[0_6px_18px_-8px_var(--accent)]'
                  : 'border-line bg-paper/60 hover:-translate-y-0.5 hover:bg-paper'
              }`}
            >
              <span aria-hidden="true" className={`leading-none transition-transform duration-300 group-hover:scale-110 ${compact ? 'text-xl' : 'text-2xl'} ${selected ? 'scale-110' : ''}`}>
                {m.emoji}
              </span>
              <span className={`font-semibold leading-tight ${compact ? 'text-[0.7rem]' : 'text-[0.8rem]'}`}>{m.label}</span>
            </button>
          )
        })}
        <button
          ref={(el) => {
            refs.current[MOODS.length] = el
          }}
          type="button"
          role="radio"
          aria-checked={customSelected}
          tabIndex={customSelected ? 0 : -1}
          onKeyDown={(e) => onKey(e, MOODS.length)}
          onClick={() => setWritingCustom(true)}
          className={`flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed px-1 text-center transition ${
            compact ? 'py-2' : 'py-3'
          } ${customSelected ? 'border-accent bg-accent-soft' : 'border-line hover:bg-paper/70'}`}
        >
          <span aria-hidden="true" className={compact ? 'text-xl' : 'text-2xl'}>
            {customSelected ? '🌿' : '✏️'}
          </span>
          <span className={`font-semibold leading-tight ${compact ? 'text-[0.7rem]' : 'text-[0.8rem]'}`}>
            {customSelected ? custom : 'Something else'}
          </span>
        </button>
      </div>

      {writingCustom && (
        <form
          className="rise mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            saveCustom()
          }}
        >
          <label htmlFor="custom-mood" className="sr-only">
            Describe your mood in your own words
          </label>
          <input
            id="custom-mood"
            className="field"
            autoFocus
            maxLength={40}
            placeholder="In your own words…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setWritingCustom(false)}
          />
          <button className="btn btn-soft shrink-0">Okay</button>
        </form>
      )}
    </div>
  )
}
