import { expect, type Page } from '@playwright/test'

export const PHRASE = 'rainy window tea'

export async function setup(page: Page, { name = 'Moon', passkey = false } = {}) {
  await page.goto('/')
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
  await expect(page.getByRole('heading', { name: 'How are you feeling today?' }).or(page.locator('#entry-body'))).toBeVisible()
}

export async function writeEntry(page: Page, { date, mood, body, favorite = false }: { date?: string; mood?: string; body: string; favorite?: boolean }) {
  await page.goto(date ? `/#/write?date=${date}` : '/#/write')
  if (mood) await page.getByRole('radio', { name: mood, exact: true }).click()
  else if (await page.getByRole('button', { name: /Skip — I just want to write/ }).isVisible()) await page.getByRole('button', { name: /Skip/ }).click()
  await page.locator('#entry-body').fill(body)
  if (favorite) await page.getByRole('button', { name: /Keep this one/ }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible()
}

/** Reads the raw IndexedDB contents, exactly as they sit on disk. */
export function rawStorage(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open('little-corner')
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction(['records', 'blobs', 'meta'])
          const out: unknown[] = []
          let pending = 3
          for (const name of ['records', 'blobs', 'meta']) {
            const r = tx.objectStore(name).getAll()
            r.onsuccess = () => {
              out.push(r.result)
              if (--pending === 0) resolve(JSON.stringify(out))
            }
          }
        }
        req.onerror = () => reject(req.error)
      }),
  )
}
