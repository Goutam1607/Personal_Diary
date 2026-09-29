import { useEffect, useId, useState, type ReactNode } from 'react'
import type { Face, Pose } from '../../lib/moods'
import type { CompanionKind } from '../../lib/types'
import { SPECIES, type Species } from './species'
import './companion.css'

interface Props {
  kind: CompanionKind
  face: Face
  pose: Pose
  /** Wave hello for a moment when first shown (skipped for heavy moods). */
  greet?: boolean
  size?: number
  className?: string
  title?: string
}

const OUTLINE = '#5e4b52'
const EYE = '#3b2e35'

/**
 * A tiny original companion drawn in SVG. Quiet by design: it reacts with its
 * face and posture, never with words. On heavy days it doesn't cheer — it just sits with you.
 */
export function Companion({ kind, face, pose, greet = false, size = 200, className = '', title }: Props) {
  const sp = SPECIES[kind]
  const gid = useId().replace(/:/g, '')
  const [waving, setWaving] = useState(greet)

  useEffect(() => {
    if (!greet) return setWaving(false)
    setWaving(true)
    const t = setTimeout(() => setWaving(false), 2800)
    return () => clearTimeout(t)
  }, [greet])

  const activePose: Pose = waving && pose !== 'jump' ? 'wave' : pose
  const tilt = pose === 'wonder' ? -6 : pose === 'window' ? 3 : 0
  const look = pose === 'stargaze' ? -3 : pose === 'read' || pose === 'window' ? 2 : 0
  const ears = pose === 'window' || face === 'quiet' || face === 'sleepy' ? 'droop' : pose === 'jump' ? 'perk' : 'up'

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`companion ${className}`}
      role="img"
      aria-label={title ?? `A little ${kind}`}
      data-pose={activePose}
      data-face={face}
    >
      <defs>
        <radialGradient id={`${gid}-body`} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor={sp.light} />
          <stop offset="100%" stopColor={sp.fill} />
        </radialGradient>
      </defs>

      <ellipse cx="100" cy="177" rx="46" ry="5" fill="rgba(60,40,50,0.10)" />

      <g className={pose === 'jump' ? 'c-bounce' : pose === 'breathe' ? 'c-breathe-slow' : 'c-breathe'}>
        <g transform={`rotate(${tilt} 100 172)`}>
          {kind === 'bunny' && <BunnyEars mode={ears} sp={sp} />}

          {/* feet */}
          <ellipse cx="80" cy="168" rx="12" ry="7" fill={sp.fill} stroke={OUTLINE} strokeWidth="2.4" />
          <ellipse cx="120" cy="168" rx="12" ry="7" fill={sp.fill} stroke={OUTLINE} strokeWidth="2.4" />

          <Body sp={sp} fill={`url(#${gid}-body)`} />
          <SpeciesDetails kind={kind} sp={sp} />

          <FaceFeatures kind={kind} face={face} look={look} sp={sp} />

          <PoseLayer pose={activePose} sp={sp} />
        </g>
      </g>

      <Ambient pose={activePose} />
    </svg>
  )
}

function Body({ sp, fill }: { sp: Species; fill: string }) {
  const blob = 'M100 80 C 133 80, 151 104, 151 133 C 151 159, 129 171, 100 171 C 71 171, 49 159, 49 133 C 49 104, 67 80, 100 80 Z'
  const shapes = (props: React.SVGProps<SVGPathElement> & React.SVGProps<SVGCircleElement>) => (
    <>
      <path d={blob} {...props} />
      {sp.extraCircles?.map(([cx, cy, r], i) => <circle key={`c${i}`} cx={cx} cy={cy} r={r} {...props} />)}
      {sp.extraPaths?.map((d, i) => <path key={`p${i}`} d={d} strokeLinejoin="round" {...props} />)}
    </>
  )
  // Draw every shape outlined first, then all fills on top: a clean outline around the union.
  return (
    <g>
      <g fill={OUTLINE} stroke={OUTLINE} strokeWidth="5" strokeLinejoin="round">
        {shapes({})}
      </g>
      <g fill={fill}>{shapes({})}</g>
      {sp.belly && <ellipse cx="100" cy="146" rx="34" ry="22" fill={sp.belly} opacity="0.9" />}
    </g>
  )
}

function BunnyEars({ mode, sp }: { mode: 'up' | 'droop' | 'perk'; sp: Species }) {
  const a = mode === 'droop' ? 62 : mode === 'perk' ? 4 : 12
  const ear = (side: -1 | 1) => (
    <g transform={`translate(${100 + side * 17} 88) rotate(${side * a})`} className={mode === 'perk' ? 'c-ear-wiggle' : ''}>
      <ellipse cx="0" cy="-27" rx="10.5" ry="29" fill={sp.fill} stroke={OUTLINE} strokeWidth="2.4" />
      <ellipse cx="0" cy="-25" rx="5" ry="20" fill={sp.accent} opacity="0.85" />
    </g>
  )
  return (
    <g>
      {ear(-1)}
      {ear(1)}
    </g>
  )
}

function SpeciesDetails({ kind, sp }: { kind: CompanionKind; sp: Species }) {
  switch (kind) {
    case 'bear':
      return (
        <g>
          <circle cx="68" cy="88" r="7" fill={sp.accent} />
          <circle cx="132" cy="88" r="7" fill={sp.accent} />
          <ellipse cx="100" cy="132" rx="15" ry="10.5" fill={sp.accent} />
          <ellipse cx="100" cy="127" rx="4.2" ry="3" fill={EYE} />
        </g>
      )
    case 'cat':
      return (
        <g>
          <path d="M66 94 L69 76 L82 86 Z" fill={sp.accent} />
          <path d="M134 94 L131 76 L118 86 Z" fill={sp.accent} />
          <path d="M97.5 126 L102.5 126 L100 129 Z" fill="#e79aa3" stroke="#e79aa3" strokeWidth="1.5" strokeLinejoin="round" />
          <g stroke={OUTLINE} strokeWidth="1.3" strokeLinecap="round" opacity="0.55">
            <path d="M62 127 L75 129" />
            <path d="M63 134 L75 133" />
            <path d="M138 127 L125 129" />
            <path d="M137 134 L125 133" />
          </g>
          <path d="M92 83 Q95 90 93 95 M100 81 L100 92 M108 83 Q105 90 107 95" stroke={sp.accent} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </g>
      )
    case 'penguin':
      return (
        <g>
          <path
            d="M100 96 C 118 90, 138 104, 136 128 C 134 150, 118 160, 100 160 C 82 160, 66 150, 64 128 C 62 104, 82 90, 100 96 Z"
            fill={sp.face}
          />
          <path d="M95 127 L105 127 L100 133 Z" fill="#f2b36b" stroke="#d99653" strokeWidth="1.6" strokeLinejoin="round" />
        </g>
      )
    case 'moon':
      return (
        <g>
          <circle cx="68" cy="146" r="4.5" fill={sp.accent} />
          <circle cx="132" cy="150" r="3.5" fill={sp.accent} />
          <circle cx="124" cy="100" r="3" fill={sp.accent} />
          <path d="M132 76 l2.6 5.4 5.9 .8 -4.3 4.1 1 5.8 -5.2 -2.8 -5.2 2.8 1 -5.8 -4.3 -4.1 5.9 -.8 z" fill="#ffd66b" stroke={OUTLINE} strokeWidth="1.6" strokeLinejoin="round" />
        </g>
      )
    case 'bunny':
      return <ellipse cx="100" cy="126.5" rx="2.6" ry="2" fill="#e8959f" />
    case 'cloud':
      return null
  }
}

function FaceFeatures({ kind, face, look, sp }: { kind: CompanionKind; face: Face; look: number; sp: Species }) {
  const ey = 118 + look
  const L = 83
  const R = 117
  const hasOwnMouthArea = kind === 'penguin'
  const cheekOpacity = face === 'blush' || face === 'grumpy' ? 0.75 : face === 'quiet' || face === 'calm' ? 0.3 : 0.5
  const cheekColor = face === 'grumpy' ? '#ef8f86' : sp.cheek

  const dotEye = (x: number, r = 4, hi = 1.3) => (
    <g key={x}>
      <circle cx={x} cy={ey} r={r} fill={EYE} />
      <circle cx={x + r * 0.35} cy={ey - r * 0.38} r={hi} fill="#fff" />
    </g>
  )
  const arc = (x: number, up: boolean) => (
    <path
      key={x}
      d={up ? `M${x - 5} ${ey + 1.5} Q${x} ${ey - 4.5} ${x + 5} ${ey + 1.5}` : `M${x - 5} ${ey - 1} Q${x} ${ey + 3.5} ${x + 5} ${ey - 1}`}
      stroke={EYE}
      strokeWidth="2.6"
      strokeLinecap="round"
      fill="none"
    />
  )

  let eyes: ReactNode
  switch (face) {
    case 'content':
    case 'blush':
      eyes = [arc(L, true), arc(R, true)]
      break
    case 'sleepy':
    case 'calm':
      eyes = [arc(L, false), arc(R, false)]
      break
    case 'sparkly':
      eyes = [L, R].map((x) => (
        <g key={x}>
          <circle cx={x} cy={ey} r={5.4} fill={EYE} />
          <circle cx={x + 1.8} cy={ey - 2} r={2.1} fill="#fff" />
          <circle cx={x - 1.8} cy={ey + 2} r={0.9} fill="#fff" />
        </g>
      ))
      break
    case 'teary':
      eyes = [dotEye(L, 4.4, 1.8), dotEye(R, 4.4, 1.8)]
      break
    case 'quiet':
      eyes = [dotEye(L, 3.6, 1.1), dotEye(R, 3.6, 1.1)]
      break
    default:
      eyes = [dotEye(L), dotEye(R)]
  }

  const brows: Record<string, string | undefined> = {
    worried: `M${L - 6} ${ey - 9} L${L + 5} ${ey - 11.5} M${R + 6} ${ey - 9} L${R - 5} ${ey - 11.5}`,
    quiet: `M${L - 5} ${ey - 8.5} L${L + 4} ${ey - 10} M${R + 5} ${ey - 8.5} L${R - 4} ${ey - 10}`,
    teary: `M${L - 5} ${ey - 9} L${L + 4} ${ey - 11} M${R + 5} ${ey - 9} L${R - 4} ${ey - 11}`,
    grumpy: `M${L - 6} ${ey - 12} L${L + 6} ${ey - 7} M${R + 6} ${ey - 12} L${R - 6} ${ey - 7}`,
  }

  const my = 132
  const mouths: Record<Face, ReactNode> = {
    smile: <path d={`M93.5 ${my - 2} Q100 ${my + 5} 106.5 ${my - 2}`} />,
    content: <path d={`M95.5 ${my - 1} Q100 ${my + 2.5} 104.5 ${my - 1}`} />,
    blush: <path d={`M94.5 ${my - 2} Q100 ${my + 4} 105.5 ${my - 2}`} />,
    sparkly: <path d={`M93 ${my - 3} Q100 ${my + 8} 107 ${my - 3} Z`} fill="#c7646f" />,
    soft: <path d={`M96.5 ${my} Q100 ${my + 2} 103.5 ${my}`} />,
    teary: <path d={`M95 ${my + 1} Q97.5 ${my - 1} 100 ${my + 1} Q102.5 ${my + 3} 105 ${my + 1}`} />,
    quiet: <path d={`M96.5 ${my + 1} Q100 ${my} 103.5 ${my + 1}`} />,
    worried: <path d={`M95 ${my + 1} Q97.5 ${my - 1.5} 100 ${my + 1} Q102.5 ${my + 3} 105 ${my + 1}`} />,
    grumpy: <path d={`M94.5 ${my + 3} Q100 ${my - 3} 105.5 ${my + 3}`} />,
    sleepy: <ellipse className="c-yawn" cx="100" cy={my + 1} rx="2.6" ry="3" fill="#c7646f" />,
    calm: <path d={`M97 ${my} Q100 ${my + 1.2} 103 ${my}`} />,
    curious: <circle cx="100" cy={my + 1} r="2.3" fill="#c7646f" />,
  }

  return (
    <g>
      <ellipse cx={L - 11} cy="130" rx={face === 'grumpy' ? 9 : 7.5} ry={face === 'grumpy' ? 6 : 4.8} fill={cheekColor} opacity={cheekOpacity} />
      <ellipse cx={R + 11} cy="130" rx={face === 'grumpy' ? 9 : 7.5} ry={face === 'grumpy' ? 6 : 4.8} fill={cheekColor} opacity={cheekOpacity} />
      <g className="c-blink">{eyes}</g>
      {brows[face] && <path d={brows[face]} stroke={EYE} strokeWidth="2.2" strokeLinecap="round" fill="none" />}
      {face === 'teary' && (
        <path d={`M${R + 3} ${ey + 6} q -2.2 3.6 0 5.2 q 2.2 -1.6 0 -5.2 z`} fill="#9cc6ec" className="c-tear" />
      )}
      {!hasOwnMouthArea && (
        <g stroke={EYE} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {mouths[face]}
        </g>
      )}
    </g>
  )
}

const paw = (sp: Species, cx: number, cy: number, key?: string, rx = 8, ry = 6.5) => (
  <ellipse key={key ?? `${cx}-${cy}`} cx={cx} cy={cy} rx={rx} ry={ry} fill={sp.fill} stroke={OUTLINE} strokeWidth="2.3" />
)

function Heart({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 12 C -14 2, -13 -10, -6 -10 C -3 -10, -1 -8, 0 -5 C 1 -8, 3 -10, 6 -10 C 13 -10, 14 2, 0 12 Z"
      fill="#f39aab"
      stroke={OUTLINE}
      strokeWidth={2 / s}
      strokeLinejoin="round"
    />
  )
}

function Blanket({ color, pattern }: { color: string; pattern: string }) {
  return (
    <g>
      <path
        d="M47 128 C 58 118, 72 138, 100 141 C 128 138, 142 118, 153 128 L 158 170 C 132 181, 68 181, 42 170 Z"
        fill={color}
        stroke={OUTLINE}
        strokeWidth="2.3"
        strokeLinejoin="round"
      />
      {[
        [64, 150],
        [84, 162],
        [108, 156],
        [132, 150],
        [124, 168],
        [74, 138],
        [146, 162],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill={pattern} />
      ))}
    </g>
  )
}

function PoseLayer({ pose, sp }: { pose: Pose; sp: Species }) {
  switch (pose) {
    case 'wave':
      return (
        <g>
          {paw(sp, 78, 152)}
          <g className="c-wave">{paw(sp, 150, 112, 'w', 8.5, 9)}</g>
        </g>
      )
    case 'jump':
      return (
        <g>
          {paw(sp, 56, 110, 'l', 8.5, 9)}
          {paw(sp, 144, 110, 'r', 8.5, 9)}
        </g>
      )
    case 'heart':
      return (
        <g>
          <Heart x={100} y={151} s={1.25} />
          {paw(sp, 84, 152)}
          {paw(sp, 116, 152)}
        </g>
      )
    case 'read':
      return (
        <g>
          <path d="M100 146 C 92 141, 80 141, 72 144 L 72 162 C 80 159, 92 159, 100 164 Z" fill="#fffdf6" stroke={OUTLINE} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M100 146 C 108 141, 120 141, 128 144 L 128 162 C 120 159, 108 159, 100 164 Z" fill="#fffdf6" stroke={OUTLINE} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M78 149 L94 150 M78 154 L92 155 M106 150 L122 149 M108 155 L122 154" stroke="#c9b9b0" strokeWidth="1.4" strokeLinecap="round" />
          {paw(sp, 72, 160)}
          {paw(sp, 128, 160)}
        </g>
      )
    case 'pillow':
      return (
        <g>
          <rect x="68" y="136" width="64" height="34" rx="15" fill="#f6cdd6" stroke={OUTLINE} strokeWidth="2.3" />
          <path d="M76 153 Q100 147 124 153" stroke="#e7a9b7" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          {paw(sp, 78, 140)}
          {paw(sp, 122, 140)}
        </g>
      )
    case 'tea':
    case 'blanket': {
      const blanket = pose === 'blanket'
      return (
        <g>
          {blanket && <Blanket color="#cfd8f0" pattern="#fff" />}
          {blanket ? (
            <Heart x={100} y={151} s={0.9} />
          ) : (
            <g>
              <path d="M87 144 H113 V151 C 113 159, 107 162, 100 162 C 93 162, 87 159, 87 151 Z" fill="#fff8ef" stroke={OUTLINE} strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M113 147 C 120 147, 120 156, 112 156" stroke={OUTLINE} strokeWidth="2.2" fill="none" />
              <path d="M88 147 H112" stroke="#d9b39a" strokeWidth="2" />
              <g className="c-steam" stroke="#c8b8c0" strokeWidth="1.8" fill="none" strokeLinecap="round">
                <path d="M96 139 q -3 -4 0 -7 q 3 -3 0 -7" />
                <path d="M104 139 q -3 -4 0 -7 q 3 -3 0 -7" />
              </g>
            </g>
          )}
          {paw(sp, 86, 154)}
          {paw(sp, 114, 154)}
        </g>
      )
    }
    case 'sleepy':
      return (
        <g>
          <Blanket color="#ddd3ee" pattern="#f8f2ff" />
          <path d="M112 86 C 124 70, 146 70, 158 92 C 150 88, 140 88, 132 92 Z" fill="#b9acd9" stroke={OUTLINE} strokeWidth="2.2" strokeLinejoin="round" />
          <circle cx="160" cy="94" r="5" fill="#fffaf4" stroke={OUTLINE} strokeWidth="2" />
        </g>
      )
    case 'grumpy':
      return (
        <g>
          {paw(sp, 90, 150, 'a', 14, 6.5)}
          {paw(sp, 110, 146, 'b', 14, 6.5)}
        </g>
      )
    case 'window':
      return (
        <g>
          {paw(sp, 92, 156)}
          {paw(sp, 108, 156)}
        </g>
      )
    default:
      return (
        <g>
          {paw(sp, 78, 152)}
          {paw(sp, 122, 152)}
        </g>
      )
  }
}

function Sparkle({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <path
      className="c-twinkle"
      style={{ animationDelay: `${delay}s`, transformOrigin: `${x}px ${y}px` }}
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -8 C 1 -2, 2 -1, 8 0 C 2 1, 1 2, 0 8 C -1 2, -2 1, -8 0 C -2 -1, -1 -2, 0 -8 Z"
      fill="#ffd66b"
    />
  )
}

/** Little things floating around the companion, depending on what it's doing. */
function Ambient({ pose }: { pose: Pose }) {
  switch (pose) {
    case 'wave':
      return (
        <g>
          <Sparkle x={40} y={92} s={0.8} />
          <Sparkle x={166} y={70} s={0.6} delay={0.8} />
        </g>
      )
    case 'jump':
      return (
        <g>
          <Sparkle x={34} y={80} />
          <Sparkle x={168} y={84} s={0.9} delay={0.5} />
          <Sparkle x={100} y={40} s={0.7} delay={1} />
          <Sparkle x={150} y={40} s={0.5} delay={1.4} />
        </g>
      )
    case 'stargaze':
      return (
        <g>
          <Sparkle x={52} y={50} s={0.6} />
          <Sparkle x={100} y={30} s={0.8} delay={1.2} />
          <Sparkle x={152} y={46} s={0.55} delay={2.1} />
        </g>
      )
    case 'heart':
      return (
        <g className="c-float">
          <Heart x={156} y={78} s={0.5} />
        </g>
      )
    case 'sleepy':
      return (
        <g fill="#8f86b0" fontFamily="var(--font-hand)" fontWeight="700">
          <text x="150" y="64" fontSize="16" className="c-z" style={{ animationDelay: '0s' }}>
            z
          </text>
          <text x="162" y="48" fontSize="20" className="c-z" style={{ animationDelay: '1.3s' }}>
            z
          </text>
          <text x="176" y="30" fontSize="24" className="c-z" style={{ animationDelay: '2.6s' }}>
            z
          </text>
        </g>
      )
    case 'grumpy':
      return (
        <g fill="#fff" stroke={OUTLINE} strokeWidth="1.8">
          <g className="c-puff">
            <circle cx="52" cy="80" r="6" />
            <circle cx="44" cy="72" r="4" />
          </g>
          <g className="c-puff" style={{ animationDelay: '0.9s' }}>
            <circle cx="148" cy="80" r="6" />
            <circle cx="156" cy="72" r="4" />
          </g>
        </g>
      )
    case 'wonder':
      return (
        <g fill="#fffaf4" stroke={OUTLINE} strokeWidth="1.8">
          <circle cx="146" cy="88" r="3" />
          <circle cx="154" cy="76" r="4.5" />
          <ellipse cx="170" cy="56" rx="18" ry="13" />
          <g fill={OUTLINE} stroke="none" className="c-dots">
            <circle cx="162" cy="56" r="2" />
            <circle cx="170" cy="56" r="2" />
            <circle cx="178" cy="56" r="2" />
          </g>
        </g>
      )
    default:
      return null
  }
}
