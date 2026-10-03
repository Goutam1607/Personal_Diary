import { expect, test } from '@playwright/test'
import { PHRASE, createAccount, deviceDiaryPages, plantDeviceDiary, rawServerData, setup, unlock, writeEntry } from './helpers'

test('an existing diary on this device moves into a new account, and the device copy stays until asked', async ({ page }) => {
  await page.goto('/')
  await plantDeviceDiary(page, 'old cozy phrase', ['the first page I ever wrote', 'rainy sunday thoughts'], 'Moon')
  await page.reload()

  await expect(page.getByText(/I found your diary on this device \(2 pages\)/)).toBeVisible()
  await createAccount(page)
  await expect(page.getByRole('heading', { name: 'I found your diary on this device.' })).toBeVisible()

  await page.getByLabel('Your diary’s secret phrase').fill('not the phrase')
  await page.getByRole('button', { name: 'Move my diary into my account' }).click()
  await expect(page.getByRole('alert')).toContainText('not quite it')
  const before = await rawServerData(page)
  expect(before).toContain('no diary') // nothing was sent

  await page.getByLabel('Your diary’s secret phrase').fill('old cozy phrase')
  await page.getByRole('button', { name: 'Move my diary into my account' }).click()
  await expect(page.getByRole('heading', { name: 'How are you feeling today?' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Moon/ }).first()).toBeVisible()

  await page.goto('/#/memories?view=timeline')
  await expect(page.getByText('the first page I ever wrote')).toBeVisible()
  await expect(page.getByText('rainy sunday thoughts')).toBeVisible()

  // Still encrypted on the server, and the device copy is untouched.
  const raw = await rawServerData(page)
  expect(raw).not.toContain('first page')
  expect(await deviceDiaryPages(page)).toBe(2)

  // The account is now the source of truth: it opens with the same phrase after a reload.
  await page.goto('/#/')
  await page.reload()
  await unlock(page, 'old cozy phrase')

  await page.goto('/#/settings')
  await expect(page.getByText('Its pages are safely in your account now.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Remove the old copy from this device' }).click()
  await page.getByRole('button', { name: 'Remove it' }).click()
  await expect(page.getByText(/The old copy is gone/)).toBeVisible()
  expect(await deviceDiaryPages(page)).toBeNull()
  await page.goto('/#/memories?view=timeline')
  await expect(page.getByText('the first page I ever wrote')).toBeVisible()
})

test('an older device diary is merged into an existing account diary without replacing anything', async ({ page }) => {
  await setup(page)
  await writeEntry(page, { body: 'already in my account' })
  await plantDeviceDiary(page, 'my old device phrase', ['only on this laptop'])
  await page.reload()
  await unlock(page)
  await page.goto('/#/')

  await expect(page.getByText('An older diary is still on this device.')).toBeVisible()
  await page.getByRole('button', { name: 'Bring them in' }).click()
  await page.getByLabel('The older diary’s secret phrase').fill('wrong one here')
  await page.getByRole('dialog').getByRole('button', { name: 'Bring them in' }).click()
  await expect(page.getByText('That phrase doesn’t open the diary on this device.')).toBeVisible()
  await page.getByLabel('The older diary’s secret phrase').fill('my old device phrase')
  await page.getByRole('dialog').getByRole('button', { name: 'Bring them in' }).click()
  await expect(page.getByText('Added 1 page to your diary 🤍')).toBeVisible()
  await expect(page.getByText('An older diary is still on this device.')).toBeHidden()

  await page.goto('/#/memories?view=timeline')
  await expect(page.getByText('only on this laptop')).toBeVisible()
  await expect(page.getByText('already in my account')).toBeVisible()
  // the account still opens with its own phrase
  await page.goto('/#/')
  await page.reload()
  await unlock(page, PHRASE)
})

test('starting fresh keeps the device diary for later', async ({ page }) => {
  await page.goto('/')
  await plantDeviceDiary(page, 'old cozy phrase', ['keep me around'])
  await page.reload()
  await createAccount(page)
  await page.getByRole('button', { name: 'Start a new diary instead' }).click()
  await page.getByRole('button', { name: 'Start a new diary', exact: true }).click()
  await setup(page, { account: false })
  expect(await deviceDiaryPages(page)).toBe(1)
  await expect(page.getByText('An older diary is still on this device.')).toBeVisible()
})

test('words written offline wait on the device and reach the account when back online', async ({ page, context }) => {
  await setup(page)
  await writeEntry(page, { body: 'online first' })
  await context.setOffline(true)
  await page.locator('#entry-body').fill('written on a train with no signal')
  await expect(page.getByRole('status').filter({ hasText: /Saved on this device/ })).toBeVisible()
  await context.setOffline(false)
  await expect(async () => expect(await rawServerData(page)).not.toContain('"records":[]')).toPass()
  // after a reload (fresh from the server), the offline words are there
  await page.goto('/#/settings')
  await expect(page.getByText(/waiting to reach your account/)).toBeHidden({ timeout: 40_000 })
  await page.goto('/#/')
  await page.reload()
  await unlock(page)
  await page.goto('/#/memories?view=timeline')
  await expect(page.getByText('written on a train with no signal')).toBeVisible()
})

test('signing out and back in on another device opens the same diary', async ({ browser }) => {
  const laptop = await (await browser.newContext()).newPage()
  await laptop.goto('/')
  const username = await createAccount(laptop)
  await setup(laptop, { account: false })
  await writeEntry(laptop, { body: 'see you on my phone' })

  const phone = await (await browser.newContext()).newPage()
  await phone.goto('/')
  await phone.getByRole('radio', { name: 'I have an account' }).click()
  await phone.getByLabel('Username').fill(username)
  await phone.getByLabel('Account password').fill('wrong password')
  await phone.getByRole('button', { name: 'Sign in' }).click()
  await expect(phone.getByRole('alert')).toContainText('don’t match')
  await phone.getByLabel('Account password').fill('cozy account pw')
  await phone.getByRole('button', { name: 'Sign in' }).click()
  await unlock(phone)
  await phone.goto('/#/memories?view=timeline')
  await expect(phone.getByText('see you on my phone')).toBeVisible()

  await phone.goto('/#/settings')
  await phone.getByRole('button', { name: 'Sign out on this device' }).click()
  await expect(phone.getByRole('button', { name: 'Sign in' }).or(phone.getByRole('button', { name: 'Create my account' }))).toBeVisible()
  await phone.goto('/#/memories')
  await expect(phone.getByText('see you on my phone')).toHaveCount(0)
})
