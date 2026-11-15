import type { LayerAction } from '../app/state'
import type { Board } from '../board/schema'
import type { Point } from '../layout/geometry'
import type { Layer, Mark } from '../layer/model'
import { attachAt, sameEnd, type Scene } from './geometry'

/** One end of a line on the map that the user can drag somewhere else. */
export interface EndRef {
  kind: 'relationship' | 'link' | 'arrow'
  id: string
  end: 'from' | 'to'
}

/** Where a dragged end was let go: the board point, and the part under the pointer, if any. */
export interface Drop {
  at: Point
  part?: string | undefined
}

const otherEnd = (end: 'from' | 'to'): 'from' | 'to' => (end === 'from' ? 'to' : 'from')

/** The parts a connection joins now, with the user's moved ends applied. */
export function connectionEnds(board: Board, layer: Layer, id: string): { from: string; to: string } | undefined {
  const r = board.relationships.find((x) => x.id === id)
  if (!r) return undefined
  const edit = layer.reconnects.find((x) => x.relationshipId === id)
  return { from: edit?.from ?? r.from, to: edit?.to ?? r.to }
}

/**
 * The change a dropped end makes, or undefined when it changes nothing.
 * A connection or a link end must land on a part other than the one at its other end. A connection end dropped back on
 * its original part removes the edit. An arrow end attaches to whatever is under it, or stays where it is let go.
 */
export function endDropAction(
  ref: EndRef,
  drop: Drop,
  ctx: { board: Board; layer: Layer; scene: Scene; reach: number },
  make: { id: string; now: Date },
): LayerAction | undefined {
  const { board, layer } = ctx
  if (ref.kind === 'relationship') {
    const ends = connectionEnds(board, layer, ref.id)
    const part = drop.part
    if (!ends || part === undefined || part === ends[ref.end] || part === ends[otherEnd(ref.end)]) return undefined
    return { type: 'reconnected', relationshipId: ref.id, end: ref.end, part, id: make.id, now: make.now }
  }
  if (ref.kind === 'link') {
    const link = layer.links.find((l) => l.id === ref.id)
    const part = drop.part
    if (!link || part === undefined || part === link[ref.end] || part === link[otherEnd(ref.end)]) return undefined
    return { type: 'linkEdited', id: ref.id, change: { [ref.end]: part } }
  }
  const mark = layer.marks.find((m): m is Extract<Mark, { kind: 'arrow' }> => m.id === ref.id && m.kind === 'arrow')
  if (!mark) return undefined
  const next = attachAt(drop.at, ctx.scene, ctx.reach, drop.part)
  const other = mark[otherEnd(ref.end)]
  if (sameEnd(next, mark[ref.end])) return undefined
  if (next.type === 'part' && other.type === 'part' && next.id === other.id) return undefined
  return { type: 'markChanged', id: mark.id, mark: { ...mark, [ref.end]: next } }
}
