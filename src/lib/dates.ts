/** Local-calendar date helpers. Entries belong to the day you lived them, not to UTC. */

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatLongDate(key: string): string {
  return parseDay(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatDate(key: string): string {
  return parseDay(key).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

export function formatShortDate(key: string): string {
  return parseDay(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function greeting(name = '', now = new Date()): string {
  const h = now.getHours()
  const n = name ? `, ${name}` : ''
  if (h < 4) return `Still awake${n}?`
  if (h < 12) return `Good morning${n}.`
  if (h < 17) return `Good afternoon${n}.`
  if (h < 21) return `Good evening${n}.`
  return name ? `Hi, ${name}.` : 'Hi, night owl.'
}

export function isNightTime(now = new Date()): boolean {
  const h = now.getHours()
  return h >= 20 || h < 6
}

export function weekdayNames(style: 'short' | 'long' = 'short'): string[] {
  // Sunday-first, localised
  return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: style }))
}
