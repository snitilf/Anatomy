import type { Board } from '../board/schema'
import type { Selection } from '../app/state'
import type { BoardDiff } from '../layer/diff'
import { itemsOf, type ArchiveEntry, type Item, type Layer } from '../layer/model'
import { summarizeLayer } from '../layer/status'

/** How many entries each group of the Review tab holds. */
/** Items this revision adopted and the app archived. They show with the answers until the next revision. */
export function adoptedNow(board: Board, layer: Layer): ArchiveEntry[] {
  const responses = board.responses
  if (!responses) return []
  const ids = new Set(responses.items.filter((r) => r.status === 'adopted').map((r) => r.feedbackId))
  return layer.archive.filter((e) => e.response.status === 'adopted' && e.response.respondsTo === responses.respondsTo && ids.has(e.item.id))
}

/** Where an item sits, so a press on it selects that on the map. */
export function selectionOf(entry: Item): Selection {
  switch (entry.type) {
    case 'note':
      return entry.item.target.type === 'board' ? { type: 'board' } : { type: entry.item.target.type, id: entry.item.target.id }
    case 'reconnect':
      return { type: 'relationship', id: entry.item.relationshipId }
    default:
      return { type: entry.type, id: entry.item.id }
  }
}

/** The items whose answers still wait for a decision: answered, and not kept. */
export function pendingAnswers(layer: Layer): Item[] {
  const kept = new Set(layer.kept)
  return itemsOf(layer).filter((e) => layer.answers.some((a) => a.id === e.item.id) && !kept.has(e.item.id))
}

/** The item one step forward or back from `current` in the pending list, wrapping at both ends. Without one, forward starts at the first item and back at the last. */
export function stepAnswer(pending: readonly Item[], current: string | undefined, move: 1 | -1): Item | undefined {
  if (pending.length === 0) return undefined
  const at = current === undefined ? -1 : pending.findIndex((e) => e.item.id === current)
  const from = at < 0 ? (move > 0 ? -1 : 0) : at
  return pending[(from + move + pending.length) % pending.length]!
}

export interface ReviewCounts {
  answers: number
  /** Archived items, which can be restored. */
  archive: number
  relinking: number
  outdated: number
  changes: number
  /** Entries that need a decision: everything but the change list. */
  decisions: number
  total: number
}

export function hasChanges(changes: BoardDiff | undefined): changes is BoardDiff {
  return changes !== undefined && changeCount(changes) > 0
}

function changeCount(d: BoardDiff): number {
  return (
    (d.boardChanged ? 1 : 0) +
    [d.added, d.removed, d.changed].reduce((n, c) => n + c.components.length + c.relationships.length, 0)
  )
}

export function reviewCounts(board: Board | undefined, layer: Layer | undefined, changes: BoardDiff | undefined): ReviewCounts {
  if (!board || !layer) return { answers: 0, archive: 0, relinking: 0, outdated: 0, changes: 0, decisions: 0, total: 0 }
  // Answers on the map wait for a decision, unless the user kept them. Adoptions are done, so they show without asking for one.
  const open = pendingAnswers(layer).length
  const adopted = adoptedNow(board, layer).length
  const answers = open + adopted
  const archive = layer.archive.length - adopted
  const summary = summarizeLayer(board, layer)
  const relinking = summary.needsRelinking.length + summary.brokenLinks.length
  const outdated = summary.outdated.length
  const changed = changes ? changeCount(changes) : 0
  return { answers, archive, relinking, outdated, changes: changed, decisions: open + relinking + outdated, total: answers + archive + relinking + outdated + changed }
}
