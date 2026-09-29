import type { MoodId } from './types'

export type Weather = 'sparkles' | 'stars' | 'hearts' | 'rain' | 'embers' | 'snowdust' | 'none'

/** What the little companion is doing. See components/companion. */
export type Pose =
  | 'wave'
  | 'stargaze'
  | 'heart'
  | 'jump'
  | 'read'
  | 'pillow'
  | 'window'
  | 'tea'
  | 'grumpy'
  | 'sleepy'
  | 'breathe'
  | 'blanket'
  | 'wonder'

export type Face = 'smile' | 'content' | 'blush' | 'sparkly' | 'soft' | 'teary' | 'quiet' | 'worried' | 'grumpy' | 'sleepy' | 'calm' | 'curious'

export interface Palette {
  /** three stops of the background wash */
  sky: [string, string, string]
  paper: string
  ink: string
  muted: string
  accent: string
  accentSoft: string
  glow: string
}

export interface Mood {
  id: MoodId
  label: string
  emoji: string
  /** A quiet line shown near the companion. Never advice, never cheerleading. */
  whisper: string
  placeholder: string
  weather: Weather
  pose: Pose
  face: Face
  /** Heavier moods get a calmer, emptier screen. */
  calm?: boolean
  day: Palette
  night: Palette
}

const nightBase = { ink: '#f3e9dc', muted: '#b9b0c9', paper: 'rgba(38, 36, 66, 0.82)' }

export const MOODS: Mood[] = [
  {
    id: 'happy',
    label: 'Happy',
    emoji: '❤️',
    whisper: 'Oh, I love this for you.',
    placeholder: 'Tell me everything! What made today beautiful? ✨',
    weather: 'sparkles',
    pose: 'wave',
    face: 'smile',
    day: {
      sky: ['#fff4d6', '#ffe1e1', '#fde8f0'],
      paper: 'rgba(255, 252, 245, 0.88)',
      ink: '#4a3a3a',
      muted: '#8a7470',
      accent: '#e5877f',
      accentSoft: '#fbd9cf',
      glow: '#ffd98a',
    },
    night: { ...nightBase, sky: ['#2a2342', '#3d2b4a', '#4a3045'], accent: '#f3a99a', accentSoft: '#5a3d52', glow: '#ffcf7a' },
  },
  {
    id: 'peaceful',
    label: 'Peaceful',
    emoji: '🌸',
    whisper: 'Let’s keep it quiet and soft in here.',
    placeholder: 'What does this calm feel like? Let it settle onto the page.',
    weather: 'stars',
    pose: 'stargaze',
    face: 'content',
    day: {
      sky: ['#f4effa', '#ece6f7', '#fbf6ee'],
      paper: 'rgba(253, 251, 247, 0.88)',
      ink: '#40395a',
      muted: '#7e7896',
      accent: '#9b8bd0',
      accentSoft: '#e3dcf5',
      glow: '#fff1c9',
    },
    night: { ...nightBase, sky: ['#1f1f3d', '#2b2850', '#3a3160'], accent: '#b7a8ec', accentSoft: '#3f3a68', glow: '#fff0b8' },
  },
  {
    id: 'loved',
    label: 'Loved',
    emoji: '🥰',
    whisper: 'Hold on to this one.',
    placeholder: 'Who made you feel this way? Write it down so you can keep it.',
    weather: 'hearts',
    pose: 'heart',
    face: 'blush',
    day: {
      sky: ['#fff0f3', '#fde2ea', '#fbeff5'],
      paper: 'rgba(255, 251, 250, 0.88)',
      ink: '#4d3440',
      muted: '#8e6f7c',
      accent: '#e27d9b',
      accentSoft: '#fad4df',
      glow: '#ffc9d6',
    },
    night: { ...nightBase, sky: ['#2a2040', '#40264a', '#4b2a45'], accent: '#f29cb6', accentSoft: '#583651', glow: '#ffb8c9' },
  },
  {
    id: 'excited',
    label: 'Excited',
    emoji: '✨',
    whisper: 'Ahh! Tell me tell me.',
    placeholder: 'What are you buzzing about? Don’t leave anything out ✨',
    weather: 'sparkles',
    pose: 'jump',
    face: 'sparkly',
    day: {
      sky: ['#fff6db', '#ffe6d2', '#f1e8ff'],
      paper: 'rgba(255, 252, 244, 0.88)',
      ink: '#4b3a33',
      muted: '#8a766c',
      accent: '#ec9a5b',
      accentSoft: '#fde0c7',
      glow: '#ffe08a',
    },
    night: { ...nightBase, sky: ['#28223f', '#3e2c47', '#34294f'], accent: '#f5b27d', accentSoft: '#5a4150', glow: '#ffd98a' },
  },
  {
    id: 'okay',
    label: 'Okay',
    emoji: '😌',
    whisper: 'Okay is a perfectly good way to be.',
    placeholder: 'Just an ordinary day? Those are worth writing down too.',
    weather: 'none',
    pose: 'read',
    face: 'soft',
    day: {
      sky: ['#fbf4ea', '#f6ece4', '#eef0f5'],
      paper: 'rgba(255, 252, 247, 0.9)',
      ink: '#3f3a3a',
      muted: '#7f7672',
      accent: '#c9967a',
      accentSoft: '#f1e0d3',
      glow: '#ffe3b5',
    },
    night: { ...nightBase, sky: ['#22223a', '#2c2a45', '#35304a'], accent: '#dcae92', accentSoft: '#473f55', glow: '#ffd9a0' },
  },
  {
    id: 'emotional',
    label: 'Emotional',
    emoji: '🥹',
    whisper: 'Big feelings are allowed here.',
    placeholder: 'Whatever is filling you up right now — it can spill out here.',
    weather: 'snowdust',
    pose: 'pillow',
    face: 'teary',
    day: {
      sky: ['#f7eef6', '#efe9f6', '#fbf1ec'],
      paper: 'rgba(254, 251, 249, 0.9)',
      ink: '#433a4f',
      muted: '#80768e',
      accent: '#b58ab5',
      accentSoft: '#eedcef',
      glow: '#ffe1cc',
    },
    night: { ...nightBase, sky: ['#221f3b', '#302848', '#3a2d4c'], accent: '#cfa3cf', accentSoft: '#473a5c', glow: '#ffd5b8' },
  },
  {
    id: 'sad',
    label: 'Sad',
    emoji: '😔',
    whisper: 'It’s okay. You don’t have to pretend here.',
    placeholder: 'You don’t have to make this sound okay. Just let it out here. 🤍',
    weather: 'rain',
    pose: 'window',
    face: 'quiet',
    calm: true,
    day: {
      sky: ['#e9eef7', '#e6e6f4', '#f3eeee'],
      paper: 'rgba(252, 252, 253, 0.9)',
      ink: '#39405a',
      muted: '#747b95',
      accent: '#8a9cc8',
      accentSoft: '#dde3f3',
      glow: '#ffe2b0',
    },
    night: { ...nightBase, sky: ['#1b2038', '#232846', '#2c2a4a'], accent: '#9fb0dc', accentSoft: '#34395e', glow: '#ffd79a' },
  },
  {
    id: 'stressed',
    label: 'Stressed',
    emoji: '😣',
    whisper: 'Put some of it down here. You don’t have to carry all of it.',
    placeholder: 'What’s pressing on you? Dump it all here, in any order.',
    weather: 'none',
    pose: 'tea',
    face: 'worried',
    calm: true,
    day: {
      sky: ['#f1f1ec', '#ecefe9', '#f5efe8'],
      paper: 'rgba(253, 252, 248, 0.9)',
      ink: '#3c3f3a',
      muted: '#767a72',
      accent: '#8fa78a',
      accentSoft: '#dfe8da',
      glow: '#ffe6b8',
    },
    night: { ...nightBase, sky: ['#1e2233', '#262a3d', '#2f2e42'], accent: '#a9c2a3', accentSoft: '#394a44', glow: '#ffdca0' },
  },
  {
    id: 'angry',
    label: 'Angry',
    emoji: '😡',
    whisper: 'Grr. Fair. Let it out.',
    placeholder: 'Write it exactly how you feel. No judging.',
    weather: 'embers',
    pose: 'grumpy',
    face: 'grumpy',
    day: {
      sky: ['#fde5da', '#f9d9d2', '#f6e3dc'],
      paper: 'rgba(255, 250, 246, 0.9)',
      ink: '#4a2f2a',
      muted: '#8c6760',
      accent: '#d9664f',
      accentSoft: '#f7cfc3',
      glow: '#ffb98a',
    },
    night: { ...nightBase, sky: ['#2a1f33', '#3d2336', '#4a2733'], accent: '#ef8a70', accentSoft: '#5c3140', glow: '#ffae80' },
  },
  {
    id: 'tired',
    label: 'Tired',
    emoji: '😴',
    whisper: 'Sleepy day. Just a few words is enough.',
    placeholder: 'A few words is enough tonight. Or a lot. Whatever you have.',
    weather: 'stars',
    pose: 'sleepy',
    face: 'sleepy',
    calm: true,
    day: {
      sky: ['#eeeaf2', '#e8e6ef', '#f3ede6'],
      paper: 'rgba(252, 251, 249, 0.9)',
      ink: '#3f3c4a',
      muted: '#7b7788',
      accent: '#a397b8',
      accentSoft: '#e5e0ee',
      glow: '#ffe5bd',
    },
    night: { ...nightBase, sky: ['#1b1b30', '#23223b', '#2c2842'], accent: '#b3a8cc', accentSoft: '#38354f', glow: '#ffdca8' },
  },
  {
    id: 'overwhelmed',
    label: 'Overwhelmed',
    emoji: '🫠',
    whisper: 'One thing at a time.',
    placeholder: 'One thought at a time. You don’t have to figure everything out right now.',
    weather: 'none',
    pose: 'breathe',
    face: 'calm',
    calm: true,
    day: {
      sky: ['#f6f4f0', '#f3f1ee', '#f6f3ef'],
      paper: 'rgba(254, 253, 251, 0.94)',
      ink: '#3d3b39',
      muted: '#7a7672',
      accent: '#a89f94',
      accentSoft: '#ebe6df',
      glow: '#fbe9cc',
    },
    night: { ...nightBase, sky: ['#1f1f2c', '#232332', '#272636'], accent: '#bdb3a6', accentSoft: '#3a3845', glow: '#f5dcb0' },
  },
  {
    id: 'lonely',
    label: 'Lonely',
    emoji: '🌧️',
    whisper: 'I’m here. You can write.',
    placeholder: 'You can say everything here. I’m listening.',
    weather: 'rain',
    pose: 'blanket',
    face: 'soft',
    calm: true,
    day: {
      sky: ['#ebeaf5', '#eee6ef', '#f5ede6'],
      paper: 'rgba(253, 251, 250, 0.9)',
      ink: '#3d3a52',
      muted: '#777390',
      accent: '#a18fc0',
      accentSoft: '#e6def2',
      glow: '#ffdcae',
    },
    night: { ...nightBase, sky: ['#1c1d37', '#262445', '#312848'], accent: '#b6a4d8', accentSoft: '#3c355c', glow: '#ffd49a' },
  },
  {
    id: 'unsure',
    label: 'I don’t know',
    emoji: '🤍',
    whisper: 'You don’t have to know. We can just sit here.',
    placeholder: 'Not sure what you’re feeling? Start anywhere. It doesn’t have to make sense.',
    weather: 'none',
    pose: 'wonder',
    face: 'curious',
    day: {
      sky: ['#f7f1ec', '#f2eef2', '#eef1f4'],
      paper: 'rgba(255, 253, 250, 0.9)',
      ink: '#3e3a3d',
      muted: '#7a7478',
      accent: '#bb9fa6',
      accentSoft: '#efe2e4',
      glow: '#ffe3bd',
    },
    night: { ...nightBase, sky: ['#201f36', '#2a2742', '#332c46'], accent: '#d3b5bd', accentSoft: '#453b52', glow: '#ffd8a8' },
  },
]

export const MOOD_BY_ID = Object.fromEntries(MOODS.map((m) => [m.id, m])) as Record<MoodId, Mood>

/** Before a mood is picked (and for custom moods): cream, blush and a little lamp. */
export const NEUTRAL: Mood = {
  ...MOOD_BY_ID.okay,
  whisper: '',
  placeholder: 'Write whatever you want. This page is only yours.',
  pose: 'wave',
  face: 'smile',
  day: {
    sky: ['#fbf1e7', '#f8e6e6', '#efe8f4'],
    paper: 'rgba(255, 252, 247, 0.9)',
    ink: '#453b3d',
    muted: '#857677',
    accent: '#d9918d',
    accentSoft: '#f6ddd8',
    glow: '#ffe0a8',
  },
  night: { ...nightBase, sky: ['#1f1f3a', '#2c2748', '#3a2d4a'], accent: '#eaa7a2', accentSoft: '#4a3a54', glow: '#ffd79a' },
}

export function moodOf(id: MoodId | null | undefined): Mood {
  return (id && MOOD_BY_ID[id]) || NEUTRAL
}

export function moodEmoji(id: MoodId | null | undefined, custom?: string): string {
  if (id) return MOOD_BY_ID[id]?.emoji ?? '🤍'
  return custom ? '🌿' : '·'
}

export function moodLabel(id: MoodId | null | undefined, custom?: string): string {
  if (custom && !id) return custom
  if (id) return MOOD_BY_ID[id]?.label ?? ''
  return ''
}

export const EMOTION_TAGS = [
  '❤️ Loved',
  '🌸 Peaceful',
  '😔 Sad',
  '🥹 Emotional',
  '😡 Angry',
  '😰 Anxious',
  '✨ Hopeful',
  '🫠 Overwhelmed',
  '🤍 Lonely',
  '😂 Funny',
  '🙏 Grateful',
  '💭 Confused',
]
