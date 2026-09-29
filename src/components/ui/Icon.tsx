const PATHS = {
  home: 'M4 11.5 12 5l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-5h-5v5h-4A1.5 1.5 0 0 1 4 19z',
  pen: 'M15.5 5.5l3 3M5 19l1-4 10-10 3 3-10 10z',
  book: 'M5 5.5A1.5 1.5 0 0 1 6.5 4H18v14H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H18',
  journey: 'M4 18c3 0 3-6 6-6s3 4 6 4 2-8 4-9',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.3 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5.5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6zM12 15v2',
  key: 'M14.5 9.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM13.5 12.5 20 19M17 16l2-2M15 14l1.5-1.5',
  fingerprint:
    'M8.5 20c1-2 1.5-4.5 1.5-8a2 2 0 0 1 4 0c0 2.5-.3 4.6-.9 6.4M5 16.5c.6-1.4 1-3 1-4.5a6 6 0 0 1 12 0c0 1.4-.1 2.8-.3 4M17 20c.4-.9.7-1.9.9-2.9M7.2 5.8A8 8 0 0 1 20 12',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  sparkle: 'M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7zM19 16c.2 1.5.8 2.1 2.3 2.3-1.5.2-2.1.8-2.3 2.3-.2-1.5-.8-2.1-2.3-2.3 1.5-.2 2.1-.8 2.3-2.3z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  calendar: 'M5 6h14v14H5zM5 10h14M9 3v4M15 3v4',
  list: 'M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6 6 18',
  sound: 'M5 10v4h3l4 4V6L8 10zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M5 10v4h3l4 4V6L8 10zM16 10l4 4M20 10l-4 4',
  moon: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  cloud: 'M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  shuffle: 'M4 7h3c5 0 5 10 10 10h3M4 17h3c1.7 0 2.8-1.1 3.7-2.6M13.3 9.6C14.2 8.1 15.3 7 17 7h3M18 4l3 3-3 3M18 14l3 3-3 3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  wind: 'M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7',
  shield: 'M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, className = '', filled = false }: { name: IconName; size?: number; className?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
