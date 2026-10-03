import { expect, type Page } from '@playwright/test'

export const PHRASE = 'rainy window tea'
export const ACCOUNT_PASSWORD = 'cozy account pw'

let n = 0
export const uniqueName = (base = 'friend') => `${base}-${Date.now().toString(36)}-${n++}-${Math.random().toString(36).slice(2, 6)}`

/** Creates an account from the sign-in screen. Returns the username. */
export async function createAccount(page: Page, username = uniqueName()) {
  await page.getByRole('radio', { name: 'I’m new here' }).click()
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Choose an account password').fill(ACCOUNT_PASSWORD)
  await page.getByLabel('Once more, just to be sure').fill(ACCOUNT_PASSWORD)
  await page.getByRole('button', { name: 'Create my account' }).click()
  await expect(page.getByLabel('Username')).toBeHidden()
  return username
}

/** `account: false` when the caller has already signed in and is on the setup screen. */
export async function setup(page: Page, { name = 'Moon', passkey = false, account = true } = {}) {
  if (account) {
    await page.goto('/')
    await createAccount(page)
  }
  await page.getByLabel('What should I call you?').fill(name)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: /This one/ }).click()
  await page.getByLabel('Secret phrase', { exact: true }).fill(PHRASE)
  await page.getByLabel('Once more, just to be sure').fill(PHRASE)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Lock it with this phrase' }).click()
  if (passkey) return
  await page.getByRole('button', { name: 'Maybe later' }).click()
  await expect(page.getByRole('heading', { name: 'How are you feeling today?' })).toBeVisible()
}

export async function unlock(page: Page, phrase = PHRASE) {
  await page.getByLabel('Your secret phrase').fill(phrase)
  await page.getByRole('button', { name: 'Open my diary' }).click()
  await expect(page.getByRole('heading', { name: 'How are you feeling today?' }).or(page.locator('#entry-body')).first()).toBeVisible()
}

export async function writeEntry(page: Page, { date, mood, body, favorite = false }: { date?: string; mood?: string; body: string; favorite?: boolean }) {
  await page.goto(date ? `/#/write?date=${date}` : '/#/write')
  if (mood) await page.getByRole('radio', { name: mood, exact: true }).click()
  else if (await page.getByRole('button', { name: /Skip — I just want to write/ }).isVisible()) await page.getByRole('button', { name: /Skip/ }).click()
  await page.locator('#entry-body').fill(body)
  if (favorite) await page.getByRole('button', { name: /Keep this one/ }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible()
}

/** Everything the server holds for this account, exactly as it sits in the database. */
export function rawServerData(page: Page): Promise<string> {
  return page.evaluate(async () => (await fetch('/api/vault/export', { headers: { 'X-Requested-With': 'little-corner' } })).text())
}

/**
 * Plants a diary the way the app stored it before accounts existed: only in this browser's IndexedDB.
 * Uses the app's own vault code, served by the dev server.
 */
export async function plantDeviceDiary(page: Page, phrase: string, bodies: string[], name = '') {
  await page.evaluate(
    async ({ phrase, bodies, name }) => {
      const vaultPath = '/src/lib/vault.ts'
      const storagePath = '/src/lib/storage.ts'
      const vault = await import(/* @vite-ignore */ vaultPath)
      const { IndexedDbStorage } = await import(/* @vite-ignore */ storagePath)
      const storage = new IndexedDbStorage()
      const key = await vault.createVault(storage, phrase)
      if (name) await vault.savePrivateSettings(storage, key, { name, customTags: [] })
      for (const [i, body] of bodies.entries()) {
        const at = new Date(Date.UTC(2026, 5, 1 + i, 12)).toISOString()
        await vault.saveEntry(storage, key, {
          id: crypto.randomUUID(),
          kind: 'entry',
          date: at.slice(0, 10),
          createdAt: at,
          updatedAt: at,
          mood: 'peaceful',
          tags: [],
          body,
          favorite: false,
        })
      }
    },
    { phrase, bodies, name },
  )
}

/** How many pages the pre-accounts diary in this browser holds (null if there isn't one). */
export function deviceDiaryPages(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const storagePath = '/src/lib/storage.ts'
    const { IndexedDbStorage } = await import(/* @vite-ignore */ storagePath)
    const storage = new IndexedDbStorage()
    return (await storage.getMeta()) ? (await storage.listRecords()).length : null
  })
}
