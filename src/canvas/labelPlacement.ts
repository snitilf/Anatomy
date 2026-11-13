export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface LabelSpot {
  x: number
  y: number
  /** Width the label may use. */
  width: number
}

export const LABEL_HEIGHT = 22
/** Cards keep this much padding. A label may overlap it, but never the text inside. */
const CARD_INSET = 14
/** Width of a label squeezed into the gap between two columns. */
export const NARROW_LABEL = 84
export const WIDE_LABEL = 150

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Reads points along an SVG path. Undefined where the browser cannot measure paths. */
function sampler(path: string): ((fraction: number) => { x: number; y: number }) | undefined {
  try {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    el.setAttribute('d', path)
    if (typeof el.getTotalLength !== 'function') return undefined
    const length = el.getTotalLength()
    if (!Number.isFinite(length) || length === 0) return undefined
    return (fraction) => {
      const p = el.getPointAtLength(length * fraction)
      return { x: p.x, y: p.y }
    }
  } catch {
    return undefined
  }
}

/**
 * Picks where a connection's label goes. It starts at the middle of the line and
 * slides along it until the label covers neither the text of a card nor another label.
 * A label that fits nowhere at full width shrinks to fit the gap between columns.
 */
export function placeLabel(
  path: string,
  textWidth: number,
  cards: readonly Rect[],
  taken: readonly Rect[],
  middle: { x: number; y: number },
): LabelSpot {
  const inner = cards.map((c) => ({
    x: c.x + CARD_INSET,
    y: c.y + CARD_INSET,
    width: c.width - CARD_INSET * 2,
    height: c.height - CARD_INSET * 2,
  }))
  const cost = (p: { x: number; y: number }, width: number) => {
    const box = { x: p.x - width / 2, y: p.y - LABEL_HEIGHT / 2, width, height: LABEL_HEIGHT }
    return (
      inner.reduce((sum, c) => sum + overlap(box, c), 0) +
      taken.reduce((sum, t) => sum + overlap(box, t) * 4, 0)
    )
  }

  const at = sampler(path)
  const fractions = [0.5]
  for (let step = 1; step <= 16; step++) fractions.push(0.5 + step * 0.025, 0.5 - step * 0.025)

  let fallback: LabelSpot = { ...middle, width: Math.min(textWidth, NARROW_LABEL) }
  let fallbackCost = Infinity
  for (const width of [Math.min(textWidth, WIDE_LABEL), Math.min(textWidth, NARROW_LABEL)]) {
    for (const fraction of fractions) {
      const spot = fraction === 0.5 ? middle : at?.(fraction)
      if (!spot) break
      const c = cost(spot, width)
      if (c === 0) return { ...spot, width }
      if (c < fallbackCost) {
        fallback = { ...spot, width }
        fallbackCost = c
      }
    }
    if (!at) break
  }
  return fallback
}
