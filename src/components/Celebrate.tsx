import { useMemo } from 'react'

/** A handful of tiny hearts or sparkles drifting up for a moment. Purely decorative. */
export function Celebrate({ kind = 'hearts', count = 14 }: { kind?: 'hearts' | 'sparkles'; count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: 50 + (Math.random() - 0.5) * 70,
        delay: Math.random() * 0.6,
        drift: (Math.random() - 0.5) * 80,
        size: 14 + Math.random() * 14,
        key: i,
      })),
    [count],
  )
  return (
    <div aria-hidden="true" className="celebrate pointer-events-none fixed inset-0 z-[65] overflow-hidden">
      {bits.map((b) => (
        <span
          key={b.key}
          className="celebrate-bit"
          style={{ left: `${b.x}%`, animationDelay: `${b.delay}s`, fontSize: b.size, ['--drift' as string]: `${b.drift}px` }}
        >
          {kind === 'hearts' ? '♥' : '✦'}
        </span>
      ))}
    </div>
  )
}
