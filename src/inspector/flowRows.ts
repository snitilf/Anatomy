import type { Board } from '../board/schema'
import { MANUAL_PREFIX } from '../canvas/buildGraph'
import type { Layer } from '../layer/model'

export type Side = 'in' | 'out'

/** One thing that flows into or out of a part. */
export interface FlowRow {
  key: string
  /** What flows: the connection's label, the link's label, or a board input or output. */
  what: string
  /** A connection or a link the row selects. Plain text rows have neither. */
  select?: { type: 'relationship' | 'link'; id: string }
  /** The edge on the map that the row emphasizes. */
  edge?: string
  /** The part at the other end. */
  part?: string
  /** The part the user moved this end away from. */
  was?: string
  /** The user drew it, or moved one of its ends. */
  yours?: 'link' | 'moved'
  /** A link with no label. */
  unlabeled?: boolean
}

/** Where a connection's ends are now, after the user's edits. */
export function endsOf(layer: Pick<Layer, 'reconnects'> | undefined, r: { id: string; from: string; to: string }) {
  const edit = layer?.reconnects.find((e) => e.relationshipId === r.id)
  return { from: edit?.from ?? r.from, to: edit?.to ?? r.to, edit }
}

/** The rows of the flow block for one part: connections first, then the board's inputs or outputs, then the user's links. */
export function flowRows(board: Board, layer: Pick<Layer, 'reconnects' | 'links'> | undefined, partId: string): Record<Side, FlowRow[]> {
  const rows: Record<Side, FlowRow[]> = { in: [], out: [] }
  for (const r of board.relationships) {
    const now = endsOf(layer, r)
    const select = { type: 'relationship' as const, id: r.id }
    const base = { what: r.label, select, edge: r.id }
    if (now.from === partId || r.from === partId) {
      const movedHere = now.from === partId
      rows.out.push({
        key: `r-${r.id}-out`,
        ...base,
        part: movedHere ? now.to : now.from,
        ...(movedHere ? (now.to !== r.to ? { was: r.to, yours: 'moved' as const } : {}) : { was: partId, yours: 'moved' as const }),
      })
    }
    if (now.to === partId || r.to === partId) {
      const movedHere = now.to === partId
      rows.in.push({
        key: `r-${r.id}-in`,
        ...base,
        part: movedHere ? now.from : now.to,
        ...(movedHere ? (now.from !== r.from ? { was: r.from, yours: 'moved' as const } : {}) : { was: partId, yours: 'moved' as const }),
      })
    }
  }
  const component = board.components.find((c) => c.id === partId)
  component?.inputs.forEach((text, i) => rows.in.push({ key: `input-${i}`, what: text }))
  component?.outputs.forEach((text, i) => rows.out.push({ key: `output-${i}`, what: text }))
  for (const link of layer?.links ?? []) {
    const row = { what: link.label, select: { type: 'link' as const, id: link.id }, edge: `${MANUAL_PREFIX}${link.id}`, yours: 'link' as const, unlabeled: link.label === '' }
    if (link.from === partId) rows.out.push({ key: `l-${link.id}-out`, ...row, part: link.to })
    if (link.to === partId) rows.in.push({ key: `l-${link.id}-in`, ...row, part: link.from })
  }
  return rows
}
