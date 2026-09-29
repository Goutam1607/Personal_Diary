import type { CompanionKind } from '../../lib/types'
import { Companion } from '../companion/Companion'
import './room.css'

/** A tiny room at night: a desk, your diary, a warm lamp, stars in the window, and a friend waiting. */
export function LockScene({ kind, awake = false }: { kind: CompanionKind; awake?: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-[380px]" style={{ aspectRatio: '380 / 260' }}>
      <svg viewBox="0 0 380 260" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="lock-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#171a3c" />
            <stop offset="1" stopColor="#453969" />
          </linearGradient>
          <radialGradient id="lock-lamp">
            <stop offset="0" stopColor="#ffd999" stopOpacity="0.8" />
            <stop offset="1" stopColor="#ffd999" stopOpacity="0" />
          </radialGradient>
          <clipPath id="lock-win">
            <rect x="34" y="24" width="120" height="120" rx="14" />
          </clipPath>
        </defs>

        <circle cx="300" cy="120" r="120" fill="url(#lock-lamp)" className="room-lampglow" />

        {/* window */}
        <rect x="28" y="18" width="132" height="132" rx="18" fill="#f5e8dc" stroke="#6c5a60" strokeWidth="2.4" />
        <g clipPath="url(#lock-win)">
          <rect x="30" y="20" width="130" height="130" fill="url(#lock-sky)" />
          <circle cx="122" cy="56" r="14" fill="#fff1c1" />
          <circle cx="129" cy="50" r="12" fill="#1c1f44" />
          {[
            [56, 46],
            [84, 36],
            [70, 84],
            [132, 96],
            [98, 116],
            [50, 124],
            [146, 130],
            [104, 70],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 ? 1.3 : 2} fill="#fff8dc" className="room-star" style={{ animationDelay: `${i * 0.6}s` }} />
          ))}
        </g>
        <path d="M94 24 V144 M34 84 H154" stroke="#6c5a60" strokeWidth="2.4" />

        {/* fairy lights */}
        <path d="M180 22 Q 230 50 280 26 Q 320 12 370 30" stroke="#b9a9cf" strokeWidth="1.3" fill="none" />
        {[
          [194, 34],
          [218, 43],
          [244, 42],
          [270, 32],
          [298, 22],
          [326, 22],
          [354, 28],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y + 4} r="3.3" fill={['#ffd98a', '#f7b6c2', '#c9b8f0', '#b8e0d2'][i % 4]} className="room-bulb" style={{ animationDelay: `${i * 0.5}s` }} />
        ))}

        {/* lamp */}
        <g stroke="#6c5a60" strokeWidth="2.2" strokeLinejoin="round">
          <path d="M280 96 H324 L314 64 H290 Z" fill="#f7d9b0" />
          <path d="M302 96 V176" />
          <path d="M288 178 H316 L312 170 H292 Z" fill="#e8c7a8" />
        </g>

        {/* desk */}
        <rect x="10" y="178" width="360" height="14" rx="7" fill="#d9b99b" stroke="#6c5a60" strokeWidth="2.2" />
        <path d="M34 192 V252 M346 192 V252" stroke="#6c5a60" strokeWidth="3" strokeLinecap="round" />

        {/* the diary */}
        <g stroke="#6c5a60" strokeWidth="2.2" strokeLinejoin="round">
          <path d="M40 176 L52 150 H126 L118 176 Z" fill="#e89b9a" />
          <path d="M46 176 L57 152 H122 L114 176 Z" fill="#f1b3b0" />
          <path d="M84 158 c-3 -3.2 -7.5 -.6 -5.4 2.8 L84 166 l5.4 -5.2 c2.1 -3.4 -2.4 -6 -5.4 -2.8z" fill="#fff3ef" strokeWidth="1.4" />
          <path d="M40 176 H118" />
        </g>
        {/* pencil */}
        <g stroke="#6c5a60" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M132 172 L172 164 L174 170 L134 178 Z" fill="#ffd98a" />
          <path d="M172 164 L182 165 L174 170 Z" fill="#f6e2c8" />
        </g>
      </svg>
      <div className="absolute" style={{ left: '43%', bottom: '28%', width: '34%' }}>
        <Companion kind={kind} face={awake ? 'smile' : 'content'} pose={awake ? 'wave' : 'tea'} size={140} title="Your companion, waiting by the diary" className="h-auto w-full" />
      </div>
    </div>
  )
}
