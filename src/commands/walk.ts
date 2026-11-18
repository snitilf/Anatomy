import type { Selection } from '../app/state'
import type { Board } from '../board/schema'
import { endsOf, flowRows, type Side } from '../inspector/flowRows'
import type { Layer } from '../layer/model'

/** The ways to walk from the selection: along a line to its target or its source, or sideways to a part that shares a source or a target. */
export type Walk = 'target' | 'source' | 'next' | 'previous'

/** Where the last step came from, so the opposite step goes back there and the sideways steps know their row. */
export interface Trail {
  /** The part the walk is at now. */
  at: string
  /** The part it came from. */
  from: string
  /** The side of `from` it left by: its outgoing lines, or its incoming ones. */
  via: Side
}

export interface Step {
  selection: Selection
  trail: Trail
}

type Parts = Pick<Layer, 'reconnects' | 'links' | 'proposals'> | undefined

/** The parts a part is joined to on one side, in the order its sidebar lists them, each once. A part never leads to itself. */
export function neighbors(board: Board, layer: Parts, id: string, side: Side): string[] {
  const out: string[] = []
  for (const row of flowRows(board, layer, id)[side]) {
    if (row.part === undefined || row.part === id || out.includes(row.part)) continue
    if (isPart(board, layer, row.part)) out.push(row.part)
  }
  return out
}

function isPart(board: Board, layer: Parts, id: string): boolean {
  return board.components.some((c) => c.id === id) || (layer?.proposals ?? []).some((p) => p.id === id)
}

function partSelection(board: Board, id: string): Selection {
  return { type: board.components.some((c) => c.id === id) ? 'component' : 'proposal', id }
}

/** The part a selected connection or link runs to or from. Its ends are where the user left them. */
function endOf(board: Board, layer: Parts, selection: Selection, side: 'from' | 'to'): string | undefined {
  if (selection.type === 'relationship') {
    const r = board.relationships.find((x) => x.id === selection.id)
    return r ? endsOf(layer, r)[side] : undefined
  }
  if (selection.type === 'link') return layer?.links.find((l) => l.id === selection.id)?.[side]
  return undefined
}

/**
 * Where a walk step goes from the selection, or undefined when there is nowhere to go.
 * From a part, `target` and `source` follow its first line out or in, unless the last step came the other way,
 * and then they go back where it came from. `next` and `previous` visit the other parts that share the source
 * (or, going the other way, the target) the walk came from, and wrap.
 * From a connection or a link, `target` and `source` select the part at its end.
 */
export function walkStep(board: Board, layer: Parts, selection: Selection | undefined, trail: Trail | undefined, move: Walk): Step | undefined {
  if (!selection || selection.type === 'board' || selection.type === 'mark') return undefined
  if (selection.type === 'relationship' || selection.type === 'link') {
    if (move === 'next' || move === 'previous') return undefined
    const here = endOf(board, layer, selection, move === 'target' ? 'to' : 'from')
    const other = endOf(board, layer, selection, move === 'target' ? 'from' : 'to')
    return here && other && isPart(board, layer, here) ? { selection: partSelection(board, here), trail: { at: here, from: other, via: move === 'target' ? 'out' : 'in' } } : undefined
  }
  const at = selection.id
  if (!isPart(board, layer, at)) return undefined
  const mine = trail?.at === at ? trail : undefined
  if (move === 'target' || move === 'source') {
    const side: Side = move === 'target' ? 'out' : 'in'
    const list = neighbors(board, layer, at, side)
    // After a step the other way, this one goes back.
    const back = mine && mine.via !== side && list.includes(mine.from) ? mine.from : undefined
    const to = back ?? list[0]
    return to ? { selection: partSelection(board, to), trail: { at: to, from: at, via: side } } : undefined
  }
  // Sideways: the row of parts that share a neighbor with this one.
  const origin = mine ? { part: mine.from, via: mine.via } : firstOrigin(board, layer, at)
  if (!origin) return undefined
  const row = neighbors(board, layer, origin.part, origin.via).filter((id) => id !== origin.part)
  const index = row.indexOf(at)
  if (index < 0 || row.length < 2) return undefined
  const to = row[(index + (move === 'next' ? 1 : row.length - 1)) % row.length]
  return to ? { selection: partSelection(board, to), trail: { at: to, from: origin.part, via: origin.via } } : undefined
}

/** With no step behind it, a part's row is the parts that share its first source, else the ones that share its first target. */
function firstOrigin(board: Board, layer: Parts, at: string): { part: string; via: Side } | undefined {
  const source = neighbors(board, layer, at, 'in')[0]
  if (source) return { part: source, via: 'out' }
  const target = neighbors(board, layer, at, 'out')[0]
  return target ? { part: target, via: 'in' } : undefined
}

let trail: Trail | undefined

/** The trail of the last step, for the commands. A step made some other way leaves it behind, because it names the part it ended at. */
export const currentTrail = (): Trail | undefined => trail
export const rememberTrail = (next: Trail | undefined): void => {
  trail = next
}
