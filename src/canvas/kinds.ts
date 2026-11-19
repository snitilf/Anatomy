import type { RelationshipKind } from '../board/schema'

export interface KindStyle {
  /** SVG dash pattern. Empty means a solid line. */
  dash: string
  width: number
}

/** Line style per kind. Only the dash and the width differ, so kinds never rely on color alone. */
export const KIND_STYLE: Record<RelationshipKind, KindStyle> = {
  calls: { dash: '', width: 1.25 },
  triggers: { dash: '', width: 1.25 },
  'sends-data-to': { dash: '', width: 1.25 },
  'stores-in': { dash: '6 4', width: 1.25 },
  'reads-from': { dash: '6 4', width: 1.25 },
  'depends-on': { dash: '1.5 4', width: 1.5 },
  unknown: { dash: '1.5 4', width: 1.5 },
}

/** The ink of every agent line. Lines sit back from the cards: one share of the text color, never a hue. The share is a token, one for each theme. */
export const LINE_INK = 'var(--line)'

/**
 * The mark of the user's hand: a dash and a dot. It draws the user's links and the edge of a part the user proposed, and no
 * line or card of the agent's uses it, so what the user added reads as theirs without its color.
 */
export const YOURS_DASH = '7 3 1.5 3'

/** The links the user draws: the user's own color and their dash and dot, unlike any connection from the agent. */
export const MANUAL_STYLE = { dash: YOURS_DASH, width: 1.25 } as const

/**
 * A dash pattern held at its size on screen. The far view scales the board down, which would shrink a dash to specks, so each
 * length is multiplied back by `--label-scale`, as the far view does for the width of its lines.
 */
export function screenDash(dash: string): string {
  return dash
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => `calc(${n}px * var(--label-scale, 1))`)
    .join(' ')
}

/** The user's dash and dot in the far view, as the value of `--far-dash`. */
export const YOURS_FAR_DASH = screenDash(YOURS_DASH)

/** A selected or hovered connection is drawn in the accent at this width. */
export const SELECTED_WIDTH = 1.75
