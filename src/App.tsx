import { useEffect } from 'react'
import { AppShell } from './components/AppShell'
import { AccountScreen } from './pages/AccountScreen'
import { MigrateScreen } from './pages/MigrateScreen'
import { Backdrop } from './components/scene/Backdrop'
import { ToastProvider } from './components/ui/Toast'
import { CheckIn } from './pages/CheckIn'
import { EntryView } from './pages/EntryView'
import { Home, resetGreeting } from './pages/Home'
import { Journey } from './pages/Journey'
import { LockScreen } from './pages/LockScreen'
import { Memories } from './pages/Memories'
import { Settings } from './pages/Settings'
import { SetupScreen } from './pages/SetupScreen'
import { Vent } from './pages/Vent'
import { Write } from './pages/Write'
import { AtmosphereProvider, useAtmosphere } from './state/atmosphere'
import { pageAliases, useRoute, type Route } from './state/router'
import { SettingsProvider, useSettings } from './state/settings'
import { useAutoLock } from './state/useAutoLock'
import { useVault, VaultProvider } from './state/vault'

export function App() {
  return (
    <SettingsProvider>
      <AtmosphereProvider>
        <VaultProvider>
          <ToastProvider>
            <Backdrop />
            <Gate />
          </ToastProvider>
        </VaultProvider>
      </AtmosphereProvider>
    </SettingsProvider>
  )
}

function Gate() {
  const { status, lock, reload } = useVault()
  const { settings } = useSettings()
  const { setMood } = useAtmosphere()
  const route = useRoute()

  useAutoLock(status === 'unlocked', settings.autoLockMinutes, settings.lockWhenHidden, lock)

  useEffect(() => {
    if (status !== 'unlocked') {
      setMood(null)
      resetGreeting()
    }
  }, [status, setMood])

  if (status === 'loading') return <div className="min-h-dvh" aria-busy="true" />
  if (status === 'offline')
    return (
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-3xl font-semibold">I can’t reach your diary right now.</h1>
        <p className="mt-3 text-muted">
          Your diary lives safely in your account, so I need a connection to open it. Check your internet, then try again.
        </p>
        <button type="button" className="btn btn-primary mt-6" onClick={() => void reload()}>
          Try again
        </button>
      </main>
    )
  if (status === 'signed-out') return <AccountScreen />
  if (status === 'migrate') return <MigrateScreen />
  if (status === 'new') return <SetupScreen />
  if (status === 'locked') return <LockScreen />
  return <Unlocked route={route} />
}

function Unlocked({ route }: { route: Route }) {
  const [section = '', id] = route.path
  const pageKey = (fresh: string) => (id ? (pageAliases.get(id) ?? id) : `new-${fresh}-${route.nonce}`)

  switch (section) {
    case 'write': {
      const key = pageKey('write')
      return (
        <AppShell section="write" focus>
          <Write key={key} instanceKey={key} id={id} params={route.params} />
        </AppShell>
      )
    }
    case 'vent': {
      const key = pageKey('vent')
      return (
        <AppShell section="write" focus>
          <Vent key={key} instanceKey={key} id={id} />
        </AppShell>
      )
    }
    case 'entry':
      return (
        <AppShell section="memories">
          <EntryView key={id} id={id ?? ''} capsule={route.params.get('capsule') === '1'} />
        </AppShell>
      )
    case 'memories':
      return (
        <AppShell section="memories">
          <Memories params={route.params} />
        </AppShell>
      )
    case 'journey':
      return (
        <AppShell section="journey">
          <Journey />
        </AppShell>
      )
    case 'checkin':
      return (
        <AppShell section="">
          <CheckIn key={id ?? 'today'} id={id} />
        </AppShell>
      )
    case 'settings':
      return (
        <AppShell section="settings">
          <Settings />
        </AppShell>
      )
    default:
      return (
        <AppShell section="">
          <Home />
        </AppShell>
      )
  }
}
