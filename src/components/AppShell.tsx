import type { ReactNode } from 'react'
import { href } from '../state/router'
import { useSettings } from '../state/settings'
import { useVault } from '../state/vault'
import { AmbiencePanel } from './AmbiencePanel'
import { Icon, type IconName } from './ui/Icon'

const NAV: { to: string; label: string; icon: IconName; match: string }[] = [
  { to: '', label: 'Home', icon: 'home', match: '' },
  { to: 'write', label: 'Write', icon: 'pen', match: 'write' },
  { to: 'memories', label: 'Memories', icon: 'book', match: 'memories' },
  { to: 'journey', label: 'Journey', icon: 'journey', match: 'journey' },
  { to: 'settings', label: 'Settings', icon: 'settings', match: 'settings' },
]

interface Props {
  section: string
  /** Distraction-free: hides navigation while writing */
  focus?: boolean
  children: ReactNode
}

export function AppShell({ section, focus = false, children }: Props) {
  const { lock } = useVault()
  const { night, update } = useSettings()

  const toggleNight = () => update({ theme: night ? 'day' : 'night' })

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <a href="#main" className="sr-only-focusable btn btn-primary fixed left-3 top-3 z-[80]">
        Skip to content
      </a>

      <header className={`sticky top-0 z-40 transition-opacity ${focus ? 'opacity-70 hover:opacity-100 focus-within:opacity-100' : ''}`}>
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
          <a href={href('')} className="hand mr-auto flex items-center gap-2 text-2xl text-ink no-underline" aria-label="my little corner, home">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-accent-soft text-lg">
              🤍
            </span>
            <span className="hidden sm:inline">my little corner</span>
          </a>

          {!focus && (
            <nav aria-label="Main" className="paper hidden items-center gap-1 rounded-full p-1 md:flex">
              {NAV.slice(0, 4).map((n) => {
                const active = section === n.match
                return (
                  <a
                    key={n.to}
                    href={href(n.to)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
                      active ? 'bg-accent-soft text-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    <Icon name={n.icon} size={18} />
                    {n.label}
                  </a>
                )
              })}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-1">
            <AmbiencePanel />
            <button type="button" className="btn btn-ghost !min-h-10 !px-3" onClick={toggleNight} title={night ? 'Day mode' : 'Night mode'}>
              <Icon name={night ? 'sun' : 'moon'} />
              <span className="sr-only">{night ? 'Switch to day mode' : 'Switch to night mode'}</span>
            </button>
            {!focus && (
              <a href={href('settings')} className="btn btn-ghost hidden !min-h-10 !px-3 md:inline-flex" title="Settings" aria-current={section === 'settings' ? 'page' : undefined}>
                <Icon name="settings" />
                <span className="sr-only">Settings</span>
              </a>
            )}
            <button type="button" className="btn btn-soft !min-h-10 !px-3 sm:!px-4" onClick={() => lock()} title="Lock the diary">
              <Icon name="lock" size={18} />
              <span className="hidden text-sm sm:inline">Lock</span>
              <span className="sr-only sm:hidden">Lock the diary</span>
            </button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className={`mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 ${focus ? 'pb-8' : 'pb-28 md:pb-12'}`}>
        {children}
      </main>

      {!focus && (
        <nav
          aria-label="Main"
          className="paper fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex justify-around rounded-[1.4rem] px-1 py-1.5 md:hidden"
        >
          {NAV.map((n) => {
            const active = section === n.match
            return (
              <a
                key={n.to}
                href={href(n.to)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-w-14 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[0.7rem] font-bold transition ${
                  active ? 'bg-accent-soft text-ink' : 'text-muted'
                }`}
              >
                <Icon name={n.icon} size={21} />
                {n.label}
              </a>
            )
          })}
        </nav>
      )}
    </div>
  )
}
