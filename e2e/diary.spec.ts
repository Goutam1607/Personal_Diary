import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { PHRASE, createAccount, rawServerData, setup, unlock, writeEntry } from './helpers'

test.describe('writing', () => {
  test('create, edit, favorite and delete an entry', async ({ page }) => {
    await setup(page)
    await writeEntry(page, { mood: 'Sad', body: 'The bus was late and I felt invisible.' })

    // the address becomes the entry's own, so reloading comes back to it
    await expect(page).toHaveURL(/#\/write\/[0-9a-f-]{36}/)
    await page.getByRole('button', { name: /Things I couldn/ }).click()
    await page.locator('#unsaid').fill('I wanted someone to notice.')
    await page.getByRole('button', { name: '+ add feelings' }).click()
    await page.getByRole('button', { name: '😔 Sad' }).click()
    await page.getByRole('button', { name: '+ my own' }).click()
    await page.getByPlaceholder('a feeling…').fill('Homesick')
    await page.getByPlaceholder('a feeling…').press('Enter')
    await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible()
    await page.getByRole('button', { name: /I’m done for now/ }).click()
    await expect(page.getByText('Okay. You got some of it out.')).toBeVisible()

    // read it back
    await page.getByRole('link', { name: 'Read it again' }).click()
    await expect(page.getByText('The bus was late and I felt invisible.')).toBeVisible()
    await expect(page.getByText('I wanted someone to notice.')).toBeHidden()
    await page.getByRole('button', { name: 'Open the sealed note' }).click()
    await expect(page.getByText('I wanted someone to notice.')).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Homesick' })).toBeVisible()

    // edit
    await page.getByRole('link', { name: 'Edit' }).click()
    await page.locator('#entry-body').fill('The bus was late. Then a stranger smiled at me.')
    await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible()
    await page.goto('/#/memories?view=timeline')
    await expect(page.getByText('Then a stranger smiled at me.')).toBeVisible()

    // favorite
    await page.getByText('Then a stranger smiled at me.').click()
    await page.getByRole('button', { name: /Keep this one/ }).click()
    await expect(page.getByRole('button', { name: /Keep this one/ })).toHaveAttribute('aria-pressed', 'true')
    await page.goto('/#/memories?view=favorites')
    await expect(page.getByText('Then a stranger smiled at me.')).toBeVisible()

    // delete
    await page.getByText('Then a stranger smiled at me.').click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page).toHaveURL(/#\/memories/)
    await page.goto('/#/memories?view=timeline')
    await expect(page.getByText('Your memories will gather here.')).toBeVisible()
  })

  test('mood selection changes the room, the companion and the placeholder', async ({ page }) => {
    await setup(page)
    await page.getByRole('radio', { name: 'Sad' }).click()
    await expect(page.getByText('It’s okay. You don’t have to pretend here.')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-mood', 'sad')
    await expect(page.locator('.room .companion')).toHaveAttribute('data-face', 'quiet')
    // not cheerful on a sad day: no waving, no sparkles
    await expect(page.locator('.room .companion')).not.toHaveAttribute('data-pose', 'wave')

    await page.getByRole('radio', { name: 'Happy' }).click()
    await expect(page.locator('.room .companion')).toHaveAttribute('data-face', 'smile')

    await page.getByRole('radio', { name: 'Overwhelmed' }).click()
    await expect(page.getByText('One thing at a time.')).toBeVisible()

    // today's mood carries into the writing page
    await page.getByRole('radio', { name: 'Lonely' }).click()
    await page.getByRole('link', { name: /Write today’s little story/ }).click()
    await expect(page.locator('#entry-body')).toHaveAttribute('placeholder', 'You can say everything here. I’m listening.')

    // custom mood
    await page.goto('/#/')
    await page.getByRole('radio', { name: 'Something else' }).click()
    await page.getByPlaceholder('In your own words…').fill('Floaty')
    await page.getByRole('button', { name: 'Okay' }).click()
    await expect(page.getByRole('radio', { name: 'Floaty' })).toHaveAttribute('aria-checked', 'true')
  })

  test('vent mode: straight to a page, and you can let it go', async ({ page }) => {
    await setup(page)
    await page.getByRole('link', { name: /I just need to vent/ }).click()
    await expect(page.getByRole('heading', { name: 'Go ahead. Let it out.' })).toBeVisible()
    await expect(page.getByRole('radiogroup')).toHaveCount(0)
    await page.locator('#vent').fill('EVERYTHING IS TOO MUCH TODAY')
    await expect(page.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible()
    await page.getByRole('button', { name: 'I’m done' }).click()
    await page.getByRole('button', { name: /Let it go/ }).click()
    await expect(page.getByRole('heading', { name: 'How are you feeling today?' })).toBeVisible()
    await page.goto('/#/memories?view=timeline')
    await expect(page.getByText('Your memories will gather here.')).toBeVisible()
  })

  test('prompts are optional and shuffle', async ({ page }) => {
    await setup(page)
    await page.getByRole('link', { name: /I don’t know what to write/ }).click()
    await page.getByRole('button', { name: /Skip/ }).click()
    const prompt = page.locator('p.font-write.italic').first()
    await expect(prompt).toBeVisible()
    const first = await prompt.textContent()
    await page.getByRole('button', { name: 'Another one' }).click()
    await expect(prompt).not.toHaveText(first!)
    await page.getByRole('button', { name: 'No thanks' }).click()
    await expect(page.getByRole('button', { name: 'Another one' })).toHaveCount(0)
  })

  test('check-in is fully optional', async ({ page }) => {
    await setup(page)
    await page.getByRole('link', { name: /Before you go/ }).click()
    await page.getByLabel('4 of 5 — Pretty good').check({ force: true })
    await page.getByLabel('What is sitting on your mind?').fill('Tomorrow’s interview.')
    await page.getByRole('button', { name: 'Okay, that’s it' }).click()
    await expect(page.getByText(/Sleep well|Take care/)).toBeVisible()
    await page.goto('/#/memories?view=timeline')
    await expect(page.getByText('Tomorrow’s interview.')).toBeVisible()
  })
})

test.describe('memories', () => {
  test('calendar, search, tags, on this day and random memory', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-29T21:00:00'))
    await setup(page)
    await writeEntry(page, { date: '2025-09-29', mood: 'Happy', body: 'Beach day. The waves were loud and I laughed a lot.' })
    await writeEntry(page, { date: '2026-09-12', mood: 'Peaceful', body: 'Tea by the window.' })
    await writeEntry(page, { date: '2026-09-20', mood: 'Lonely', body: 'Quiet phone all day.' })

    // on this day
    await page.goto('/#/')
    await expect(page.getByRole('heading', { name: 'You were here on this day…' })).toBeVisible()
    await expect(page.getByText('A year ago, you wrote this…')).toBeVisible()

    // calendar shows moods on dates; clicking opens the page
    await page.goto('/#/memories')
    await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible()
    await page.getByRole('button', { name: /12 September, 1 page/ }).click()
    await expect(page.getByText('Tea by the window.')).toBeVisible()

    // an empty past day offers to write for it
    await page.goto('/#/memories')
    await page.getByRole('button', { name: '15 September', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Write something for this day' })).toBeVisible()

    // search and filters
    await page.goto('/#/memories?view=timeline')
    await page.getByLabel('Search your diary').fill('waves')
    await expect(page.getByText('Beach day.', { exact: false })).toBeVisible()
    await expect(page.getByText('Tea by the window.')).toHaveCount(0)
    await page.getByLabel('Search your diary').fill('')
    await page.getByRole('button', { name: /Lonely/ }).first().click()
    await expect(page.getByText('Quiet phone all day.')).toBeVisible()
    await expect(page.getByText('Tea by the window.')).toHaveCount(0)

    // random memory opens a time capsule
    await page.getByRole('button', { name: /random memory/ }).click()
    await expect(page.getByText('A tiny time capsule…')).toBeVisible()
    await page.locator('.capsule').click({ force: true })
    await expect(page.getByText('You wrote this, once…')).toBeVisible()
  })

  test('empty states are gentle', async ({ page }) => {
    await setup(page)
    await expect(page.getByText('Your first page is waiting.')).toBeVisible()
    await page.goto('/#/memories?view=favorites')
    await expect(page.getByText('No kept pages yet.')).toBeVisible()
    await page.goto('/#/journey')
    await expect(page.getByText('No pressure. Your diary will still be here.')).toBeVisible()
  })

  test('journey never uses guilt', async ({ page }) => {
    await setup(page)
    await writeEntry(page, { mood: 'Tired', body: 'Long day.' })
    await page.goto('/#/journey')
    await expect(page.getByText(/You’ve been showing up for yourself 1 time this month/)).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/streak|fail|missed/i)
  })
})

test.describe('privacy', () => {
  test('entries are encrypted at rest and persist across reloads', async ({ page }) => {
    await setup(page, { name: 'Secret Name' })
    await writeEntry(page, { mood: 'Angry', body: 'This sentence must never appear in plain text.' })
    const raw = await rawServerData(page)
    expect(raw).toContain('"records"')
    expect(raw).not.toContain('must never appear')
    expect(raw).not.toContain('Secret Name')
    expect(raw).not.toContain('angry')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'This little world is private.' })).toBeVisible()
    // wrong phrase is refused
    await page.getByLabel('Your secret phrase').fill('not my phrase')
    await page.getByRole('button', { name: 'Open my diary' }).click()
    await expect(page.getByRole('alert')).toContainText('not quite it')
    await unlock(page)
    await expect(page.locator('#entry-body')).toHaveValue('This sentence must never appear in plain text.')
  })

  test('lock button clears the diary from the screen', async ({ page }) => {
    await setup(page)
    await writeEntry(page, { body: 'private words' })
    await page.getByRole('button', { name: /Lock/ }).click()
    await expect(page.getByRole('heading', { name: 'This little world is private.' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('private words')
  })

  test('auto-lock after inactivity saves what you were writing first', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-29T21:00:00') })
    await page.addInitScript(() =>
      localStorage.setItem('little-corner:device-settings', JSON.stringify({ autoLockMinutes: 1, lockWhenHidden: false })),
    )
    await setup(page)
    await page.goto('/#/write')
    await page.getByRole('button', { name: /Skip/ }).click()
    await page.locator('#entry-body').pressSequentially('half a thought', { delay: 5 })
    await page.clock.runFor(30_000)
    await expect(page.locator('#entry-body')).toBeVisible()
    await page.clock.runFor(40_000)
    await expect(page.getByRole('heading', { name: 'This little world is private.' })).toBeVisible()
    await unlock(page)
    await page.goto('/#/memories?view=timeline')
    await expect(page.getByText('half a thought')).toBeVisible()
  })

  test('encrypted backup can be downloaded', async ({ page }) => {
    await setup(page)
    await writeEntry(page, { body: 'backup me' })
    await page.goto('/#/settings')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download encrypted backup' }).click()
    const file = await (await download).path()
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('"app":"little-corner"')
    expect(text).not.toContain('backup me')
  })
})

test.describe('passkeys (virtual authenticator)', () => {
  async function authenticator(page: import('@playwright/test').Page, hasPrf: boolean) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('WebAuthn.enable')
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        ctap2Version: 'ctap2_1',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        hasPrf,
        automaticPresenceSimulation: true,
      },
    })
  }

  test('a PRF passkey really unlocks the diary', async ({ page }) => {
    await page.goto('/#/')
    await authenticator(page, true)
    await setup(page, { passkey: true })
    await page.getByRole('button', { name: 'Set up a passkey' }).click()
    await expect(page.getByRole('heading', { name: /Your passkey is ready/ })).toBeVisible()
    await page.getByRole('button', { name: 'Open my little corner' }).click()
    await writeEntry(page, { body: 'opened with a fingerprint' })

    await page.getByRole('button', { name: /Lock/ }).click()
    await page.getByRole('button', { name: 'Unlock with passkey' }).click()
    await expect(page.locator('#entry-body')).toHaveValue('opened with a fingerprint')
  })

  test('a passkey without PRF is refused honestly', async ({ page }) => {
    await page.goto('/#/')
    await authenticator(page, false)
    await setup(page, { passkey: true })
    await page.getByRole('button', { name: 'Set up a passkey' }).click()
    await expect(page.getByText(/can’t produce the kind of secret key/)).toBeVisible()
    await page.getByRole('button', { name: 'Open my little corner' }).click()
    await page.getByRole('button', { name: /Lock/ }).click()
    // no fake passkey button: phrase only
    await expect(page.getByRole('button', { name: 'Unlock with passkey' })).toHaveCount(0)
    await unlock(page, PHRASE)
  })
})

test.describe('look & feel', () => {
  test('night mode follows the system, reduced motion is respected', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark', reducedMotion: 'reduce', viewport: { width: 1280, height: 860 } })
    const page = await ctx.newPage()
    await setup(page)
    await expect(page.locator('html')).toHaveClass(/night/)
    await expect(page.locator('html')).toHaveClass(/no-motion/)
    const anim = await page.locator('.c-blink').first().evaluate((el) => getComputedStyle(el).animationName)
    expect(anim).toBe('none')
    await ctx.close()
  })

  test('large text and animation settings apply', async ({ page }) => {
    await setup(page)
    await page.goto('/#/settings')
    await page.getByRole('switch', { name: 'Larger text' }).check({ force: true })
    await expect(page.locator('html')).toHaveClass(/large-text/)
    await page.getByText('Keep everything still').click()
    await expect(page.locator('html')).toHaveClass(/no-motion/)
  })

  test('keyboard: skip link and arrow keys through moods', async ({ page }) => {
    await setup(page)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
    await page.getByRole('radio', { name: 'Happy' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: 'Peaceful' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('radio', { name: 'Peaceful' })).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('shared link, separate diaries', () => {
  test('two friends opening the same site each get their own private space', async ({ browser }) => {
    const alex = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage()
    const sam = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage()

    await setup(alex, { name: 'Alex' })
    await writeEntry(alex, { body: 'Alex’s secret page' })

    // Sam opens the same link and starts fresh, with their own account and no trace of Alex
    await sam.goto('/')
    await createAccount(sam)
    await expect(sam.getByRole('heading', { name: 'Let’s make you a little corner.' })).toBeVisible()
    await expect(sam.getByText('This corner is only yours.')).toBeVisible()
    await setup(sam, { name: 'Sam', account: false })
    await expect(sam.getByText('Your first page is waiting.')).toBeVisible()
    await sam.goto('/#/memories?view=timeline')
    await expect(sam.getByText('Alex’s secret page')).toHaveCount(0)

    await alex.goto('/#/memories?view=timeline')
    await expect(alex.getByText('Alex’s secret page')).toBeVisible()
  })
})
