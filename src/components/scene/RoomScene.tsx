import { useId } from 'react'
import type { Mood } from '../../lib/moods'
import type { CompanionKind } from '../../lib/types'
import { Companion } from '../companion/Companion'
import { SPECIES } from '../companion/species'
import './room.css'

interface Props {
  mood: Mood
  kind: CompanionKind
  night: boolean
  greet?: boolean
  className?: string
}

/**
 * A little room: a window with the weather of your mood, a lamp, fairy lights,
 * and your companion sitting on the rug. On overwhelmed days the room empties out.
 */
export function RoomScene({ mood, kind, night, greet, className = '' }: Props) {
  const id = useId().replace(/:/g, '')
  const minimal = mood.id === 'overwhelmed'
  const rainy = mood.weather === 'rain'
  const starry = night || mood.weather === 'stars'
  const sunny = !night && (mood.weather === 'sparkles' || mood.weather === 'hearts')
  const heavy = !!mood.calm
  const skyTop = night ? '#1d2146' : rainy ? '#b9c3dc' : mood.day.sky[2]
  const skyBottom = night ? '#4a3d6e' : rainy ? '#dfe3ef' : mood.day.glow

  return (
    <div className={`room ${className}`}>
      <svg viewBox="0 0 360 250" className="room-art" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={skyTop} />
            <stop offset="1" stopColor={skyBottom} />
          </linearGradient>
          <radialGradient id={`${id}-lamp`}>
            <stop offset="0" stopColor={mood.day.glow} stopOpacity={night ? 0.75 : 0.45} />
            <stop offset="1" stopColor={mood.day.glow} stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${id}-win`}>
            <path d="M44 176 V92 A56 56 0 0 1 156 92 V176 Z" />
          </clipPath>
        </defs>

        {/* lamp glow */}
        {!minimal && <circle cx="306" cy="118" r={night ? 110 : 80} fill={`url(#${id}-lamp)`} className="room-lampglow" />}

        {/* window */}
        <path d="M36 184 V92 A64 64 0 0 1 164 92 V184 Z" fill="#fbf4ec" stroke="#6c5a60" strokeWidth="2.4" />
        <g clipPath={`url(#${id}-win)`}>
          <rect x="40" y="20" width="120" height="170" fill={`url(#${id}-sky)`} />
          {night && !rainy && (
            <g>
              <circle cx="124" cy="70" r="13" fill="#fff1c1" />
              <circle cx="130" cy="65" r="11" fill={skyTop} opacity="0.95" />
            </g>
          )}
          {sunny && <circle cx="120" cy="80" r="22" fill="#fff4c4" opacity="0.9" className="room-sun" />}
          {!night && !rainy && !sunny && (
            <g fill="#fff" opacity="0.85" className="room-cloud">
              <ellipse cx="80" cy="96" rx="18" ry="8" />
              <ellipse cx="92" cy="90" rx="12" ry="9" />
            </g>
          )}
          {starry &&
            !rainy &&
            [
              [66, 70],
              [94, 56],
              [72, 112],
              [140, 108],
              [104, 132],
              [58, 146],
              [148, 146],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i % 2 ? 1.4 : 1.9} fill="#fff8dc" className="room-star" style={{ animationDelay: `${i * 0.7}s` }} />
            ))}
          {rainy && (
            <g stroke={night ? '#aebde8' : '#8d9cc4'} strokeWidth="1.4" strokeLinecap="round" className="room-rain">
              {Array.from({ length: 16 }, (_, i) => (
                <line key={i} x1={46 + i * 7.5} y1={-10 + ((i * 37) % 60)} x2={43 + i * 7.5} y2={2 + ((i * 37) % 60)} style={{ animationDelay: `${(i % 5) * -0.28}s` }} />
              ))}
            </g>
          )}
          {rainy && (
            <g fill={night ? '#aebde8' : '#9fb0d6'} opacity="0.6">
              <circle cx="70" cy="150" r="2" />
              <circle cx="118" cy="128" r="1.6" />
              <circle cx="96" cy="162" r="1.8" />
            </g>
          )}
        </g>
        <path d="M100 30 V176 M44 118 H156" stroke="#6c5a60" strokeWidth="2.4" />
        {/* sill */}
        <rect x="28" y="176" width="144" height="12" rx="6" fill="#f4e6da" stroke="#6c5a60" strokeWidth="2.2" />

        {/* curtains */}
        {!minimal && (
          <g stroke="#6c5a60" strokeWidth="2" strokeLinejoin="round">
            <path d="M20 22 C 34 70, 26 130, 40 190 L 22 190 C 14 130, 14 70, 20 22 Z" fill="#f3cfd3" />
            <path d="M180 22 C 166 70, 174 130, 160 190 L 178 190 C 186 130, 186 70, 180 22 Z" fill="#f3cfd3" />
            <path d="M14 20 H186" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}

        {/* plant on the sill */}
        {!minimal && (
          <g stroke="#6c5a60" strokeWidth="2" strokeLinejoin="round">
            <path d="M52 164 C 44 150, 48 140, 58 146 C 58 136, 68 136, 66 150 C 74 142, 80 150, 70 164 Z" fill="#a9c79b" />
            <path d="M50 162 H74 L70 177 H54 Z" fill="#e5a58f" />
          </g>
        )}

        {/* fairy lights */}
        {!minimal && !heavy && (
          <g>
            <path d="M196 26 Q 238 48 280 30 Q 316 16 350 36" stroke="#6c5a60" strokeWidth="1.4" fill="none" opacity="0.7" />
            {[
              [208, 34],
              [230, 41],
              [254, 40],
              [278, 31],
              [302, 25],
              [326, 27],
              [346, 34],
            ].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y + 4} r="3.4" fill={['#ffd98a', '#f7b6c2', '#c9b8f0', '#b8e0d2'][i % 4]} className="room-bulb" style={{ animationDelay: `${i * 0.45}s` }} />
            ))}
          </g>
        )}
        {/* when things are heavy the lights stay on, just dim and still */}
        {!minimal && heavy && (
          <g opacity="0.55">
            <path d="M196 26 Q 238 48 280 30 Q 316 16 350 36" stroke="#6c5a60" strokeWidth="1.4" fill="none" opacity="0.7" />
            {[208, 254, 302, 346].map((x, i) => (
              <circle key={x} cx={x} cy={[38, 44, 29, 38][i]} r="3" fill="#ffd98a" />
            ))}
          </g>
        )}

        {/* lamp */}
        {!minimal && (
          <g stroke="#6c5a60" strokeWidth="2.2" strokeLinejoin="round">
            <path d="M286 92 H326 L318 64 H294 Z" fill="#f7d9b0" />
            <path d="M306 92 V226" />
            <path d="M290 230 H322 L317 222 H295 Z" fill="#e8c7a8" />
          </g>
        )}

        {/* books and mug on a little shelf */}
        {!minimal && (
          <g stroke="#6c5a60" strokeWidth="2" strokeLinejoin="round">
            <rect x="46" y="218" width="50" height="10" rx="3" fill="#b9aee0" />
            <rect x="50" y="208" width="42" height="10" rx="3" fill="#f2c0b7" />
            <rect x="54" y="199" width="34" height="9" rx="3" fill="#bcd8c4" />
            <path d="M332 212 H350 V224 C 350 229, 346 230, 341 230 C 336 230, 332 229, 332 224 Z" fill="#fff6ec" />
            <path d="M350 215 C 356 215, 356 223, 350 223" fill="none" />
          </g>
        )}

        {/* rug */}
        <ellipse cx="200" cy="232" rx="150" ry="14" fill={mood.day.accentSoft} opacity={night ? 0.35 : 0.8} />
      </svg>
      <div className="room-companion">
        <Companion kind={kind} face={mood.face} pose={mood.pose} greet={greet && !heavy} size={170} title={`${SPECIES[kind].name}, keeping you company`} />
      </div>
    </div>
  )
}
