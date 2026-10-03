import { useEffect, useState, type ReactNode } from 'react'
import { useSettings } from '../state/settings'
import { Icon } from './ui/Icon'

const GLYPHS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789+/='

function scramble(length: number) {
  let out = ''
  for (let i = 0; i < length; i++) out += i > 0 && i % 5 === 0 ? '·' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
  return out
}

/** Decorative: shows what a page looks like to everyone but its owner. Re-scrambles gently unless motion is reduced. */
function Ciphertext({ length = 23 }: { length?: number }) {
  const { motion } = useSettings()
  const [text, setText] = useState(() => scramble(length))
  useEffect(() => {
    if (!motion) return
    const t = window.setInterval(() => setText(scramble(length)), 1400)
    return () => window.clearInterval(t)
  }, [motion, length])
  return <span className="cipher">{text}</span>
}

const PROMISES = [
  {
    icon: 'lock',
    title: 'Locked right here, on your device',
    body: 'Every page is encrypted on your phone or laptop before it’s saved. It travels and rests as scrambled letters.',
  },
  {
    icon: 'heart',
    title: 'Nobody can peek. Not even us.',
    body: 'Not your friends, not other people here, not the person who runs this site. All they ever get is the scrambled side.',
  },
  {
    icon: 'key',
    title: 'Only your key opens it',
    body: 'Your secret phrase never leaves your device and is never stored anywhere. Your memories open for you, and only you.',
  },
] as const

/** A warm, honest explanation of what keeps a diary private (see README → "Privacy and security"). */
export function PrivacyPromise({ className = '' }: { className?: string }) {
  return (
    <section aria-labelledby="promise-title" className={`promise rise relative w-full rounded-[2rem] px-5 pb-6 pt-10 text-left sm:px-7 ${className}`}>
      <span className="promise-seal" aria-hidden="true">
        <Icon name="heart" size={20} filled />
      </span>

      <h2 id="promise-title" className="font-display text-center text-2xl font-semibold tracking-tight">
        Your words stay yours
      </h2>
      <p className="hand mt-1 text-center text-xl text-muted">a little promise from your corner 🤍</p>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs" aria-hidden="true">
        <div className="min-w-0 rounded-2xl bg-paper/80 px-3 py-2.5 shadow-sm">
          <p className="font-semibold text-muted">What you see</p>
          <p className="font-write mt-1 truncate text-sm italic">dear diary 🤍</p>
        </div>
        <span className="promise-lock grid size-9 place-items-center rounded-full bg-accent text-white">
          <Icon name="lock" size={18} />
        </span>
        <div className="min-w-0 rounded-2xl bg-ink/[0.06] px-3 py-2.5">
          <p className="font-semibold text-muted">What anyone else sees</p>
          <p className="mt-1 truncate text-sm">
            <Ciphertext />
          </p>
        </div>
      </div>
      <p className="sr-only">
        What you write is shown to you as words. Everyone else, including the server, only sees scrambled, encrypted letters.
      </p>

      <ul className="mt-5 space-y-3.5">
        {PROMISES.map((p, i) => (
          <li key={p.title} className="rise flex items-start gap-3" style={{ animationDelay: `${150 + i * 120}ms` }}>
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Icon name={p.icon} size={20} />
            </span>
            <span>
              <span className="block text-[0.95rem] font-bold leading-snug">{p.title}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-muted">{p.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A small reassurance for places where a whole card would be too much. */
export function PrivacyWhisper({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`promise-whisper inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold ${className}`}>
      <Icon name="lock" size={16} className="shrink-0 text-accent" />
      <span>{children}</span>
    </p>
  )
}
