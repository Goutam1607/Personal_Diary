import { useMemo } from 'react'
import type { Weather } from '../../lib/moods'
import { useAtmosphere } from '../../state/atmosphere'
import { useSettings } from '../../state/settings'
import './backdrop.css'

/** Deterministic pseudo-random so the sky doesn't reshuffle on every render. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

interface Speck {
  x: number
  y: number
  size: number
  delay: number
  duration: number
}

function specks(count: number, seed: number): Speck[] {
  const r = seeded(seed)
  return Array.from({ length: count }, () => ({
    x: r() * 100,
    y: r() * 100,
    size: r(),
    delay: r() * -20,
    duration: r(),
  }))
}

/**
 * The quiet world behind the pages: a soft sky, a few stars at night, and a little
 * weather that matches your mood. Heavy moods get a nearly empty, still sky.
 * While you're writing, everything dims so it never competes with your words.
 */
export function Backdrop() {
  const { mood, writing } = useAtmosphere()
  const { night } = useSettings()
  const weather: Weather = mood.weather
  const stars = useMemo(() => specks(46, 7), [])
  const drops = useMemo(() => specks(70, 11), [])
  const floaters = useMemo(() => specks(14, 23), [])

  const showStars = night || weather === 'stars'
  const calm = mood.calm || mood.id === 'overwhelmed'

  return (
    <div className={`backdrop ${writing ? 'backdrop-writing' : ''}`} aria-hidden="true">
      <div className="backdrop-glow" />
      {night && <div className="backdrop-lamp" />}

      {showStars && (
        <div className="layer">
          {stars.slice(0, calm ? 18 : 46).map((s, i) => (
            <span
              key={i}
              className="star"
              style={{
                left: `${s.x}%`,
                top: `${s.y * 70}%`,
                width: 2 + s.size * 2.5,
                height: 2 + s.size * 2.5,
                animationDelay: `${s.delay}s`,
                animationDuration: `${3 + s.duration * 5}s`,
              }}
            />
          ))}
        </div>
      )}

      {weather === 'rain' && (
        <div className="layer rain">
          {drops.map((d, i) => (
            <span
              key={i}
              className="drop"
              style={{
                left: `${d.x}%`,
                animationDelay: `${d.delay * 0.1}s`,
                animationDuration: `${1.1 + d.duration * 0.9}s`,
                opacity: 0.25 + d.size * 0.35,
                height: 14 + d.size * 18,
              }}
            />
          ))}
        </div>
      )}

      {(weather === 'sparkles' || weather === 'hearts' || weather === 'embers' || weather === 'snowdust') && (
        <div className={`layer floaters floaters-${weather}`}>
          {floaters.slice(0, weather === 'embers' ? 10 : 14).map((f, i) => (
            <span
              key={i}
              className="floater"
              style={{
                left: `${f.x}%`,
                animationDelay: `${f.delay}s`,
                animationDuration: `${14 + f.duration * 12}s`,
                fontSize: `${10 + f.size * 10}px`,
              }}
            >
              {weather === 'hearts' ? '♥' : weather === 'sparkles' ? '✦' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
