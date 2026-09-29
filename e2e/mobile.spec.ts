import { expect, test } from '@playwright/test'
import { setup, writeEntry } from './helpers'

test('mobile: bottom navigation, roomy editor, no sideways scrolling', async ({ page }) => {
  await setup(page)
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(await noOverflow()).toBe(true)
  await expect(page.getByRole('navigation', { name: 'Main' }).last()).toBeVisible()

  await writeEntry(page, { mood: 'Emotional', body: 'writing on my phone in bed' })
  const box = await page.locator('#entry-body').boundingBox()
  expect(box!.width).toBeGreaterThan(300)
  expect(box!.height).toBeGreaterThan(250)
  // the navigation bar steps aside while writing
  await expect(page.locator('nav[aria-label="Main"]:visible')).toHaveCount(0)
  expect(await noOverflow()).toBe(true)

  for (const route of ['/#/memories', '/#/memories?view=timeline', '/#/journey', '/#/settings', '/#/checkin']) {
    await page.goto(route)
    await page.waitForTimeout(300)
    expect(await noOverflow(), route).toBe(true)
  }
})
