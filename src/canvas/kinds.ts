import type { RelationshipKind } from '../board/schema'

export interface KindStyle {
  /** SVG dash pattern. Empty means a solid line. */
  dash: string
  width: number
  /** Which ink the line uses. */
  tone: 'strong' | 'light' | 'faint'
}

/** Line style per kind. The pattern differs, so kinds never rely on color alone. */
export const KIND_STYLE: Record<RelationshipKind, KindStyle> = {
  calls: { dash: '', width: 1.25, tone: 'strong' },
  triggers: { dash: '', width: 1.25, tone: 'strong' },
  'sends-data-to': { dash: '', width: 1.25, tone: 'light' },
  'stores-in': { dash: '6 4', width: 1.25, tone: 'light' },
  'reads-from': { dash: '6 4', width: 1.25, tone: 'light' },
  'depends-on': { dash: '1.5 4', width: 1.5, tone: 'light' },
  unknown: { dash: '1.5 4', width: 1.5, tone: 'faint' },
}

/** Lines sit back from the cards: a share of the text color, never a hue. The shares are tokens, one set for each theme. */
export const TONE_COLOR: Record<KindStyle['tone'], string> = {
  strong: 'var(--line-strong)',
  light: 'var(--line-light)',
  faint: 'var(--line-faint)',
}

/** The links the user draws: the user's own color and a dash and dot pattern, unlike any connection from the agent. */
export const MANUAL_STYLE = { dash: '7 3 1.5 3', width: 1.25 } as const

/** A selected or hovered connection is drawn in the accent at this width. */
export const SELECTED_WIDTH = 1.75
