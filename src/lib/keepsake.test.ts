import { describe, expect, it } from 'vitest'
import { keepsakeHtml } from './keepsake'
import type { Entry } from './types'

const e = (over: Partial<Entry>): Entry => ({
  id: Math.random().toString(36),
  kind: 'entry',
  date: '2026-09-29',
  createdAt: '2026-09-29T21:00:00',
  updatedAt: '2026-09-29T21:00:00',
  mood: null,
  tags: [],
  body: '',
  favorite: false,
  ...over,
})

describe('keepsake book', () => {
  const now = new Date(2026, 9, 5)

  it('escapes everything the person wrote', () => {
    const html = keepsakeHtml([e({ body: '<script>alert(1)</script> & "quotes"', tags: ['<b>x</b>'], unsaid: '<img src=x>' })], { name: '<i>Me</i>', now })
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<b>x</b>')
    expect(html).not.toContain('<img src=x>')
    expect(html).not.toContain('<i>Me</i>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;')
  })

  it('groups pages into months, oldest first, and skips empty drafts', () => {
    const html = keepsakeHtml(
      [
        e({ date: '2026-10-02', createdAt: '2026-10-02T09:00:00', body: 'October page', mood: 'happy' }),
        e({ date: '2026-09-12', body: 'September page', favorite: true }),
        e({ date: '2026-08-01', body: '   ' }),
      ],
      { now },
    )
    expect(html.indexOf('September page')).toBeLessThan(html.indexOf('October page'))
    expect(html).toContain('id="m-2026-09"')
    expect(html).toContain('id="m-2026-10"')
    expect(html).not.toContain('id="m-2026-08"')
    expect(html).toContain('2 pages')
    expect(html).toContain('class="page kept"')
    expect(html).toContain('Only kept pages')
  })

  it('keeps paragraphs and line breaks', () => {
    const html = keepsakeHtml([e({ body: 'line one\nline two\n\nsecond paragraph' })], { now })
    expect(html).toContain('<p>line one<br>line two</p><p>second paragraph</p>')
  })

  it('has a gentle empty state', () => {
    expect(keepsakeHtml([], { now })).toContain('No pages yet.')
  })
})
