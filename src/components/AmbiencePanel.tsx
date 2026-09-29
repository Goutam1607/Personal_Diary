import { useEffect, useId, useRef, useState } from 'react'
import { Ambience, SOUNDS, type SoundId } from '../lib/ambience'
import { Icon } from './ui/Icon'

const engine = new Ambience()

/** Sound is always off until you choose something. */
export function AmbiencePanel() {
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState<SoundId | null>(null)
  const [volume, setVolume] = useState(0.5)
  const panelId = useId()
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => () => engine.stop(0.3), [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (id: SoundId) => {
    if (playing === id) {
      engine.stop()
      setPlaying(null)
    } else {
      engine.play(id, volume)
      setPlaying(id)
    }
  }

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        className={`btn btn-ghost !min-h-10 !px-3 ${playing ? '!text-accent' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        title="Ambient sounds"
      >
        <Icon name={playing ? 'sound' : 'mute'} />
        <span className="sr-only">Ambient sounds{playing ? `, playing ${playing}` : ', off'}</span>
      </button>
      {open && (
        <div id={panelId} className="rise paper absolute right-0 top-12 z-50 w-64 rounded-3xl p-4" role="group" aria-label="Ambient sounds">
          <p className="hand text-xl">A little background sound?</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {SOUNDS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={playing === s.id}
                onClick={() => choose(s.id)}
                className={`flex flex-col items-center rounded-2xl px-1 py-2 text-xs font-semibold transition ${
                  playing === s.id ? 'bg-accent text-white night:text-[#231d33]' : 'bg-accent-soft/60 hover:bg-accent-soft'
                }`}
              >
                <span className="text-xl" aria-hidden="true">
                  {s.emoji}
                </span>
                {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                engine.stop()
                setPlaying(null)
              }}
              className="flex flex-col items-center rounded-2xl px-1 py-2 text-xs font-semibold text-muted hover:bg-accent-soft/60"
            >
              <span className="text-xl" aria-hidden="true">
                🤫
              </span>
              Quiet
            </button>
          </div>
          <label className="mt-4 block text-xs font-semibold text-muted" htmlFor={`${panelId}-vol`}>
            Volume
          </label>
          <input
            id={`${panelId}-vol`}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value)
              setVolume(v)
              engine.setVolume(v)
            }}
            className="mt-1 w-full accent-[var(--accent)]"
          />
        </div>
      )}
    </div>
  )
}
