import { useState } from 'react'
import { EMOTION_TAGS } from '../lib/moods'

interface Props {
  value: string[]
  customTags: string[]
  onChange: (tags: string[]) => void
  onNewCustomTag: (tag: string) => void
}

export function TagPicker({ value, customTags, onChange, onNewCustomTag }: Props) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const all = [...EMOTION_TAGS, ...customTags.filter((t) => !EMOTION_TAGS.includes(t)), ...value.filter((t) => !EMOTION_TAGS.includes(t) && !customTags.includes(t))]

  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])

  const add = () => {
    const t = draft.trim().slice(0, 30)
    if (t) {
      if (!value.includes(t)) onChange([...value, t])
      if (!customTags.includes(t) && !EMOTION_TAGS.includes(t)) onNewCustomTag(t)
    }
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Emotions in this entry">
      {all.map((t) => {
        const on = value.includes(t)
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(t)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              on ? 'border-accent bg-accent-soft text-ink' : 'border-line text-muted hover:border-accent/60 hover:text-ink'
            }`}
          >
            {t}
          </button>
        )
      })}
      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
          className="flex gap-1"
        >
          <label htmlFor="new-tag" className="sr-only">
            New feeling
          </label>
          <input
            id="new-tag"
            autoFocus
            className="field !w-40 !rounded-full !py-1.5 text-sm"
            placeholder="a feeling…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-dashed border-line px-3 py-1.5 text-sm font-semibold text-muted hover:text-ink"
        >
          + my own
        </button>
      )}
    </div>
  )
}
