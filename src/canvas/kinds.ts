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
  calls: { dash: '', width: 1.75, tone: 'strong' },
  triggers: { dash: '', width: 1.75, tone: 'strong' },
  'sends-data-to': { dash: '', width: 1.5, tone: 'light' },
  'stores-in': { dash: '7 5', width: 1.5, tone: 'light' },
  'reads-from': { dash: '7 5', width: 1.5, tone: 'light' },
  'depends-on': { dash: '1.5 5', width: 2, tone: 'light' },
  unknown: { dash: '1.5 5', width: 2, tone: 'faint' },
}

export const TONE_COLOR: Record<KindStyle['tone'], string> = {
  strong: 'color-mix(in srgb, var(--ink) 78%, transparent)',
  light: 'color-mix(in srgb, var(--ink) 52%, transparent)',
  faint: 'color-mix(in srgb, var(--ink) 34%, transparent)',
}
