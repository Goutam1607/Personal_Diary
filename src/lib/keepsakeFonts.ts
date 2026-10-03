import caveat from '@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2?inline'
import fraunces from '@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2?inline'
import loraItalic from '@fontsource-variable/lora/files/lora-latin-wght-italic.woff2?inline'
import lora from '@fontsource-variable/lora/files/lora-latin-wght-normal.woff2?inline'
import nunito from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?inline'

/**
 * The diary's own fonts, embedded as data URLs so the keepsake book looks right offline
 * and never asks a font server for anything. Loaded lazily — only when someone downloads a copy.
 */
const faces: [family: string, src: string, weight: string, style: string][] = [
  ['Keepsake Display', fraunces, '100 900', 'normal'],
  ['Keepsake Write', lora, '400 700', 'normal'],
  ['Keepsake Write', loraItalic, '400 700', 'italic'],
  ['Keepsake Hand', caveat, '400 700', 'normal'],
  ['Keepsake Sans', nunito, '200 1000', 'normal'],
]

export const KEEPSAKE_FONT_CSS = faces
  .map(
    ([family, src, weight, style]) =>
      `@font-face{font-family:'${family}';src:url(${src}) format('woff2');font-weight:${weight};font-style:${style};font-display:swap}`,
  )
  .join('\n')
