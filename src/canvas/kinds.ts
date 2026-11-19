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

/** The links the user draws: the user's own color and a dash and dot pattern, unlike any connection from the agent. */
export const MANUAL_STYLE = { dash: '7 3 1.5 3', width: 1.25 } as const

/** A selected or hovered connection is drawn in the accent at this width. */
export const SELECTED_WIDTH = 1.75
