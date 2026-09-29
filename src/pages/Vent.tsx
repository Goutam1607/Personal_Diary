import { useEffect, useRef, useState } from 'react'
import { AutoTextarea } from '../components/ui/AutoTextarea'
import { Icon } from '../components/ui/Icon'
import { useToast } from '../components/ui/Toast'
import { newEntry } from '../lib/entries'
import type { Entry } from '../lib/types'
import { useAtmosphere } from '../state/atmosphere'
import { href, navigate, pageAliases } from '../state/router'
import { useAutosave } from '../state/useAutosave'
import { useVault } from '../state/vault'

/** No mood question, no prompts, no advice. Just a page. */
export function Vent({ id, instanceKey }: { id?: string; instanceKey: string }) {
  const { entries, remove } = useVault()
  const { setWriting } = useAtmosphere()
  const toast = useToast()
  const existing = id ? entries.find((e) => e.id === id) : undefined
  const [entry, setEntry] = useState<Entry>(() => existing ?? newEntry('vent'))
  const { status, flush, discard, isSaved } = useAutosave(entry, !!existing)
  const [done, setDone] = useState(false)
  const [lettingGo, setLettingGo] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setWriting(true)
    return () => setWriting(false)
  }, [setWriting])

  useEffect(() => {
    if (!id && status === 'saved') {
      pageAliases.set(entry.id, instanceKey)
      navigate(`vent/${entry.id}`, { replace: true })
    }
  }, [id, status, entry.id, instanceKey])

  const finish = async () => {
    await flush()
    if (!isSaved()) return navigate('')
    setDone(true)
  }

  const letGo = async () => {
    setLettingGo(true)
    discard()
    await remove(entry.id)
    setTimeout(() => {
      toast('Let go. 🍃')
      navigate('', { replace: true })
    }, 1400)
  }

  if (done) {
    return (
      <div className={`page-enter mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center text-center ${lettingGo ? 'let-go' : ''}`}>
        <p className="hand text-4xl">Okay. That’s out of you now.</p>
        <p className="mt-3 leading-relaxed text-muted">You can keep this in your diary, or let it go. Both are completely fine.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href={href('')} className="btn btn-primary">
            Keep it, and go home
          </a>
          <button type="button" className="btn btn-soft" onClick={letGo} disabled={lettingGo}>
            🍃 Let it go (delete it)
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter mx-auto max-w-3xl pt-4 sm:pt-10">
      <div className="mb-4 flex items-center justify-between">
        <a href={href('')} className="btn btn-ghost !px-3 text-sm">
          <Icon name="back" size={18} /> Home
        </a>
        <p className="text-xs text-muted" role="status" aria-live="polite">
          {status === 'saved' ? 'Saved · encrypted' : status === 'saving' ? 'Saving…' : ''}
        </p>
      </div>
      <h1 className="hand text-4xl sm:text-5xl">Go ahead. Let it out.</h1>
      <label htmlFor="vent" className="sr-only">
        Vent
      </label>
      <AutoTextarea
        ref={ref}
        id="vent"
        autoFocus
        minRows={14}
        value={entry.body}
        onChange={(e) => setEntry((x) => ({ ...x, body: e.target.value }))}
        className="font-write mt-6 block min-h-[60vh] w-full rounded-[1.6rem] bg-paper/70 p-5 text-[1.15rem] leading-[2rem] text-ink shadow-[var(--shadow-soft)] focus:outline-none sm:p-8 sm:text-[1.2rem]"
      />
      <div className="mt-5 flex justify-end">
        <button type="button" className="btn btn-primary" onClick={finish}>
          I’m done
        </button>
      </div>
    </div>
  )
}
