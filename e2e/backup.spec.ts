import { readFile } from 'node:fs/promises'
import { expect, test, type BrowserContext } from '@playwright/test'
import { PHRASE, createAccount, setup, unlock, writeEntry } from './helpers'

/** A tiny fake of Google sign-in + the Drive API, so the whole backup round-trip runs offline. */
async function fakeGoogle(context: BrowserContext) {
  const files: { id: string; name: string; createdTime: string; body: string; folder: boolean; trashed?: boolean }[] = []
  let n = 0
  await context.route('https://accounts.google.com/**', async (route) => {
    const url = new URL(route.request().url())
    const back = `${url.searchParams.get('redirect_uri')}#access_token=fake-token&token_type=Bearer&expires_in=3599&state=${url.searchParams.get('state')}`
    await route.fulfill({ status: 302, headers: { location: back } })
  })
  await context.route('https://www.googleapis.com/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    expect(req.headers().authorization).toBe('Bearer fake-token')
    const json = (body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const q = url.searchParams.get('q') ?? ''
    if (url.pathname.startsWith('/upload/')) {
      const raw = req.postData() ?? ''
      const parts = raw.split(/--lc-[^\r\n]+/).map((p) => p.split('\r\n\r\n')[1]?.trim())
      const meta = JSON.parse(parts[1]!)
      files.push({ id: `f${++n}`, name: meta.name, createdTime: new Date(Date.now() + n).toISOString(), body: parts[2]!, folder: false })
      return json({ id: `f${n}` })
    }
    const id = url.pathname.split('/files/')[1]
    if (id && url.searchParams.get('alt') === 'media') return json(JSON.parse(files.find((f) => f.id === id)!.body))
    if (req.method() === 'POST') {
      files.push({ id: 'folder', name: 'folder', createdTime: '', body: '', folder: true })
      return json({ id: 'folder' })
    }
    if (q.includes('application/vnd.google-apps.folder')) return json({ files: files.filter((f) => f.folder) })
    return json({ files: files.filter((f) => !f.folder).reverse() })
  })
  return files
}

test('backs up to Google Drive and brings the diary back on a new device', async ({ browser }) => {
  const phone = await browser.newContext()
  const files = await fakeGoogle(phone)
  const page = await phone.newPage()
  await setup(page)
  await writeEntry(page, { body: 'the lake was golden today' })
  await page.goto('/#/')
  await expect(page.getByText('Your pages aren’t backed up to Google Drive yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Back up now' }).click()
  await expect(page.getByText('Backed up to Google Drive ☁️🤍', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back up now' })).toBeHidden()

  const uploaded = files.filter((f) => !f.folder)
  expect(uploaded).toHaveLength(1)
  expect(uploaded[0].body).not.toContain('the lake was golden')

  await page.goto('/#/settings')
  await expect(page.getByText(/Last backed up to Google Drive today/)).toBeVisible()

  // A brand-new device and a brand-new account: no diary yet.
  const newPhone = await browser.newContext()
  await fakeGoogle(newPhone).then((f) => f.push(...files))
  const fresh = await newPhone.newPage()
  await fresh.goto('/')
  await createAccount(fresh)
  await fresh.getByRole('button', { name: /Already have a diary/ }).click()
  await fresh.getByRole('button', { name: 'Find my backups in Google Drive' }).click()
  await expect(fresh.getByLabel('Which backup?')).toBeVisible()
  await fresh.getByLabel('The backup’s secret phrase').fill(PHRASE)
  await fresh.getByRole('button', { name: 'Restore' }).click()
  await unlock(fresh)
  await fresh.goto('/#/memories?view=timeline')
  await expect(fresh.getByText('the lake was golden today')).toBeVisible()
  await phone.close()
  await newPhone.close()
})

test('reads a backup into a readable book without changing this diary', async ({ page }) => {
  await setup(page)
  await writeEntry(page, { body: 'a page worth keeping', favorite: true })
  await page.goto('/#/settings')
  const saving = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download encrypted backup' }).click()
  const backupPath = await (await saving).path()

  await page.getByRole('button', { name: 'Read a backup' }).click()
  await page.getByRole('radio', { name: 'A backup file' }).click()
  await page.getByLabel('Backup file').setInputFiles(backupPath)
  await page.getByLabel('The backup’s secret phrase').fill('wrong phrase here')
  await page.getByRole('button', { name: 'Make my book' }).click()
  await expect(page.getByText('That phrase doesn’t open this backup.')).toBeVisible()

  await page.getByLabel('The backup’s secret phrase').fill(PHRASE)
  const book = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Make my book' }).click()
  const download = await book
  expect(download.suggestedFilename()).toMatch(/^my-memories-.*\.html$/)
  const html = await readFile((await download.path())!, 'utf8')
  expect(html).toContain('a page worth keeping')
  expect(html).toContain('Moon’s pages')

  // The diary itself is untouched and still open.
  await page.goto('/#/memories?view=timeline')
  await expect(page.getByText('a page worth keeping')).toBeVisible()
})
