/** Maximum rendered height before an explanation offers "Show more". */
export const EXPLANATION_MAX = 320
/** Minimum hidden height required before showing "Show more". */
export const EXPLANATION_MIN_HIDDEN = 40

export interface CutBlock {
  /** Top edge relative to the explanation container, in pixels. */
  top: number
  /** Bottom edge relative to the explanation container, in pixels. */
  bottom: number
  /** Paragraphs may fall back to a whole-line boundary when a single block exceeds the cap; list items never split. */
  splittable?: boolean
}

export interface CutOptions {
  max?: number
  minHidden?: number
  lineHeight?: number
}

/**
 * Pure clamp rule for the sidebar explanation.
 * - Uncut when totalHeight <= 320 px.
 * - Cuts between blocks (never inside a line or a list item).
 * - Requires at least 40 px hidden; otherwise returns null so "Show more" never appears for a sliver.
 */
export function explanationCut(totalHeight: number, blocks: readonly CutBlock[], options: CutOptions = {}): number | null {
  const max = options.max ?? EXPLANATION_MAX
  const minHidden = options.minHidden ?? EXPLANATION_MIN_HIDDEN
  const lineHeight = options.lineHeight ?? 0

  if (totalHeight <= max) return null

  // Prefer the last whole block that finishes at or before the cap.
  let cut: number | undefined
  for (const block of blocks) {
    if (block.bottom <= max) cut = block.bottom
  }
  if (cut !== undefined) {
    return totalHeight - cut >= minHidden ? cut : null
  }

  // No whole block fits: only split the first block if it is a splittable paragraph and we know its line height.
  const first = blocks[0]
  if (first && first.splittable && lineHeight > 0) {
    const lines = Math.floor((max - first.top) / lineHeight)
    if (lines >= 1) {
      const lineCut = first.top + lines * lineHeight
      return totalHeight - lineCut >= minHidden ? lineCut : null
    }
  }

  return null
}
