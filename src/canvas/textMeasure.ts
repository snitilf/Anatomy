/**
 * Text widths measured in the interface font, Inter Variable, so a label is sized by what it will really take.
 * One table per style, one entry per printable ASCII character from space to tilde, in CSS pixels at that style.
 * Characters outside the table take an average width for their script.
 */
export type TextStyle = 'label' | 'title'

/** The connection label: 11px regular. */
const LABEL = [
  3.09, 3.16, 5.12, 6.97, 7.06, 10.8, 7.08, 3.3, 4.01, 4.01, 5.51, 7.28, 3.17, 5.06, 3.17, 3.96, 6.94,
  4.47, 6.71, 6.79, 7.11, 6.53, 6.82, 6.23, 6.81, 6.82, 3.17, 3.32, 7.28, 7.28, 7.28, 5.62, 10.62,
  7.59, 7.2, 8.04, 7.94, 6.61, 6.49, 8.21, 8.17, 2.95, 6.28, 7.39, 6.22, 9.94, 8.29, 8.41, 7.03, 8.41,
  7.08, 7.06, 7.1, 8.19, 7.59, 10.84, 7.5, 7.47, 6.92, 4.01, 3.96, 4.01, 5.18, 5.02, 3.55, 6.18, 6.74,
  6.28, 6.74, 6.41, 4.07, 6.75, 6.5, 2.66, 2.66, 6.04, 2.66, 9.64, 6.5, 6.6, 6.74, 6.74, 4.14, 5.81,
  3.6, 6.5, 6.18, 9, 6, 6.18, 6.07, 4.69, 3.66, 4.69, 7.28
]

/** The group name: 12px medium. */
const TITLE = [
  3.2, 3.65, 5.93, 7.66, 7.75, 11.92, 7.84, 3.75, 4.43, 4.43, 6.24, 8.01, 3.64, 5.55, 3.64, 4.44, 7.74,
  4.98, 7.4, 7.52, 7.87, 7.23, 7.56, 6.85, 7.55, 7.56, 3.64, 3.79, 8.01, 8.01, 8.01, 6.33, 11.79, 8.51,
  7.88, 8.8, 8.66, 7.24, 7.07, 8.97, 8.93, 3.27, 6.9, 8.25, 6.79, 10.95, 9.08, 9.2, 7.7, 9.22, 7.78,
  7.75, 7.83, 8.88, 8.51, 12.03, 8.41, 8.35, 7.69, 4.43, 4.44, 4.43, 5.72, 5.55, 4.04, 6.81, 7.42,
  6.92, 7.42, 7.05, 4.55, 7.43, 7.22, 3.02, 3.02, 6.71, 3.02, 10.66, 7.22, 7.25, 7.42, 7.42, 4.64,
  6.46, 4.08, 7.22, 6.89, 9.95, 6.69, 6.9, 6.71, 5.29, 4.15, 5.29, 8.01
]

const TABLES: Record<TextStyle, readonly number[]> = { label: LABEL, title: TITLE }
const EM: Record<TextStyle, number> = { label: 11, title: 12 }
/** The width a browser can differ from the table by, such as through kerning or a fallback font. */
const SLACK = 1.03

/** Width of one character. Wide scripts and emoji take a full em, other letters outside ASCII an average one. */
export function charWidth(char: string, style: TextStyle): number {
  const code = char.codePointAt(0) ?? 0
  if (code >= 32 && code < 127) return TABLES[style][code - 32] as number
  const em = EM[style]
  if (code >= 0x2e80 || code >= 0x1f000) return em
  return em * 0.6
}

const FONTS: Record<TextStyle, string> = { label: '400 11px "Inter Variable"', title: '500 12px "Inter Variable"' }

let context: { font: string; measureText(text: string): { width: number } } | null | undefined
const cache = new Map<string, number>()

/** The canvas of the browser, where there is one. Unit tests run without. */
function canvas(): typeof context {
  if (context === undefined) {
    try {
      context = typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d')
    } catch {
      context = null
    }
  }
  return context
}

/** The width the browser gives the whole string in the loaded interface font, or `undefined` while it cannot say. */
function measured(text: string, style: TextStyle): number | undefined {
  const ctx = canvas()
  if (!ctx || typeof document === 'undefined' || !document.fonts?.check(FONTS[style])) return undefined
  const key = `${style}\u0000${text}`
  let width = cache.get(key)
  if (width === undefined) {
    ctx.font = FONTS[style]
    width = ctx.measureText(text).width
    if (cache.size > 5000) cache.clear()
    cache.set(key, width)
  }
  return width
}

/**
 * The width of a string. In the browser it is measured whole in the loaded font, so wide letters and other scripts are
 * right too. Without a canvas, or before the font has loaded, the table and the average widths stand in.
 */
export function textWidth(text: string, style: TextStyle): number {
  const real = measured(text, style)
  if (real !== undefined) return real * SLACK
  let total = 0
  for (const c of text) total += charWidth(c, style)
  return total * SLACK
}
