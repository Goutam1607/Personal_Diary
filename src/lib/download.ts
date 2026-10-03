export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Builds the readable keepsake book (see keepsake.ts), loading it and its fonts only when needed. */
export async function downloadKeepsake(entries: import('./types').Entry[], name: string) {
  const [{ keepsakeHtml }, { KEEPSAKE_FONT_CSS }] = await Promise.all([import('./keepsake'), import('./keepsakeFonts')])
  download(
    `my-memories-${new Date().toISOString().slice(0, 10)}.html`,
    keepsakeHtml(entries, { name, fontCss: KEEPSAKE_FONT_CSS }),
    'text/html',
  )
}
