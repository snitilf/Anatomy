import { KIND_ORDER, KIND_WORDS } from '../app/labels'
import type { RelationshipKind } from '../board/schema'
import { KIND_STYLE, type KindStyle } from './kinds'

/** The short name of each kind, as the key says it. */
export const KIND_SHORT: Record<RelationshipKind, string> = {
  calls: 'Calls',
  triggers: 'Triggers',
  'sends-data-to': 'Sends data to',
  'stores-in': 'Stores data in',
  'reads-from': 'Reads data from',
  'depends-on': 'Depends on',
  unknown: 'Not known',
}

/** Names for kinds that share a look and read better as one phrase than as a list. Any other set is listed by its kinds. */
const TOGETHER: Record<string, string> = {
  'calls|triggers|sends-data-to': 'Calls, triggers, sends data',
  'stores-in|reads-from': 'Stores or reads data',
  'depends-on|unknown': 'Depends on, not known',
}

export interface KeyRow {
  /** The kinds that are drawn this way, in the order of `KIND_ORDER`. */
  kinds: RelationshipKind[]
  style: KindStyle
  label: string
  /** What each kind says between two parts, as a hover title. */
  words: string
}

/** What the eye tells apart: the dash and the width. Every line has the same ink. */
const lookOf = (s: KindStyle) => `${s.dash}|${s.width}`

const listed = (kinds: readonly RelationshipKind[]): string => kinds.map((k, i) => (i === 0 ? KIND_SHORT[k] : KIND_SHORT[k].toLowerCase())).join(', ')

/**
 * One row for each way a line is drawn, naming every kind that is drawn that way. Kinds are grouped by their dash and width, so a change to a kind's style regroups the key with no other edit. The rows follow the order of the kinds.
 */
export function lineKeyRows(styles: Readonly<Record<RelationshipKind, KindStyle>> = KIND_STYLE): KeyRow[] {
  const rows = new Map<string, KeyRow>()
  for (const kind of KIND_ORDER) {
    const style = styles[kind]
    const look = lookOf(style)
    const row = rows.get(look)
    if (row) row.kinds.push(kind)
    else rows.set(look, { kinds: [kind], style, label: '', words: '' })
  }
  return [...rows.values()].map((row) => ({
    ...row,
    label: TOGETHER[row.kinds.join('|')] ?? listed(row.kinds),
    words: row.kinds.map((k) => KIND_WORDS[k]).join('; '),
  }))
}
