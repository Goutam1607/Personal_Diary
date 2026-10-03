import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { ACCOUNT_PASSWORD, PHRASE, createAccount, setup, unlock, writeEntry } from './helpers'

async function signInAs(page: Page, username: string) {
  await page.goto('/')
  await page.getByRole('radio', { name: 'I have an account' }).click()
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Account password').fill(ACCOUNT_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await unlock(page)
}

test('clearing all browser data loses nothing: the diary comes back after signing in', async ({ page, context }) => {
  await page.goto('/')
  const username = await createAccount(page)
  await setup(page, { account: false })
  await writeEntry(page, { mood: 'Happy', body: 'a page that must survive a cleared browser', favorite: true })

  // Everything the browser keeps for this site: cookies, localStorage, IndexedDB (the outbox).
  await context.clearCookies()
  await page.evaluate(async () => {
    localStorage.clear()
    for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name)
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Create my account' })).toBeVisible()

  await signInAs(page, username)
  await page.goto('/#/memories?view=favorites')
  await expect(page.getByText('a page that must survive a cleared browser')).toBeVisible()
})

/**
 * Spans a full server restart (a stand-in for a Render redeploy): run once with
 * LC_PERSIST_PHASE=write, restart the server on the same external database, then run with
 * LC_PERSIST_PHASE=read. Both phases use LC_PERSIST_USER. Skipped in normal runs.
 */
const phase = process.env.LC_PERSIST_PHASE
const user = process.env.LC_PERSIST_USER ?? ''

test('before the restart: write pages', async ({ page }) => {
  test.skip(phase !== 'write', 'only in the restart check')
  await page.goto('/')
  await createAccount(page, user)
  await setup(page, { account: false, name: 'Robin' })
  await writeEntry(page, { mood: 'Peaceful', body: 'written before the redeploy', favorite: true })
  await writeEntry(page, { date: '2026-09-20', mood: 'Sad', body: 'a heavier page before the redeploy' })
})

test('after the restart: everything is still there, and exports work', async ({ page }) => {
  test.skip(phase !== 'read', 'only in the restart check')
  await signInAs(page, user)
  await page.goto('/#/memories?view=timeline')
  await expect(page.getByText('written before the redeploy')).toBeVisible()
  await expect(page.getByText('a heavier page before the redeploy')).toBeVisible()

  // search and moods
  await page.getByRole('searchbox', { name: 'Search your diary' }).fill('heavier')
  await expect(page.getByText('a heavier page before the redeploy')).toBeVisible()
  await expect(page.getByText('written before the redeploy')).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Search your diary' }).fill('')
  await page.getByRole('button', { name: 'Peaceful' }).click()
  await expect(page.getByText('written before the redeploy')).toBeVisible()
  await expect(page.getByText('a heavier page before the redeploy')).toHaveCount(0)

  // favorites
  await page.goto('/#/memories?view=favorites')
  await expect(page.getByText('written before the redeploy')).toBeVisible()

  // the keepsake book (the "Save as PDF" export) and the encrypted backup
  await page.goto('/#/settings')
  await page.getByRole('button', { name: 'Download my memories' }).click()
  const book = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download keepsake book' }).click()
  const html = await readFile((await (await book).path())!, 'utf8')
  expect(html).toContain('written before the redeploy')
  expect(html).toContain('Robin')

  const saving = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download encrypted backup' }).click()
  const backup = await readFile((await (await saving).path())!, 'utf8')
  expect(backup).toContain('"records"')
  expect(backup).not.toContain('written before the redeploy')
  expect(PHRASE).toBeTruthy()
})
