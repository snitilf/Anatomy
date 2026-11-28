import type { Board } from '../board/schema'
import { changedFields, type BoardDiff } from '../layer/diff'
import type { Layer } from '../layer/model'
import type { Rect } from '../layout/geometry'

export type RevisionKind = 'new' | 'changed'

/** What a part or connection carries after a revision: the kind, shown on the map in a word, and the sentence a screen reader hears. */
export interface RevisionMark {
  kind: RevisionKind
  words: string
}

/** A part the revision removed, drawn faintly where it was until the revision is marked reviewed. */
export interface Ghost {
  id: string
  label: string
  rect: Rect
}

export interface RevisionMarks {
  parts: ReadonlyMap<string, RevisionMark>
  lines: ReadonlyMap<string, RevisionMark>
  ghosts: readonly Ghost[]
}

export const NO_MARKS: RevisionMarks = { parts: new Map(), lines: new Map(), ghosts: [] }

/**
 * The markers of the revision that is open: new and changed parts and connections, and the ghosts of removed parts at the
 * places the layer kept for them. Nothing once the changes are marked reviewed, or when the board opened without a
 * revision before it.
 */
export function revisionMarks(board: Board, previous: Board | undefined, changes: BoardDiff | undefined, layer: Pick<Layer, 'placed'> | undefined): RevisionMarks {
  if (!changes || !previous) return NO_MARKS
  const { added, changed, removed } = changes
  if (added.components.length + added.relationships.length + changed.components.length + changed.relationships.length + removed.components.length === 0) return NO_MARKS
  const at = `in revision ${board.revision}`
  const mark = (kind: RevisionKind, type: 'component' | 'relationship', id: string): RevisionMark => {
    if (kind === 'new') return { kind, words: `New ${at}.` }
    const fields = changedFields(previous, board, { type, id })
    return { kind, words: fields.length > 0 ? `Changed ${at}: ${fields.join(', ')}.` : `Changed ${at}.` }
  }
  const of = (type: 'component' | 'relationship', ids: { added: readonly string[]; changed: readonly string[] }) =>
    new Map([...ids.added.map((id) => [id, mark('new', type, id)] as const), ...ids.changed.map((id) => [id, mark('changed', type, id)] as const)])
  const held = layer?.placed ?? {}
  const ghosts = removed.components.flatMap((id) => {
    const place = Object.hasOwn(held, id) ? held[id] : undefined
    const part = previous.components.find((c) => c.id === id)
    return place && part ? [{ id, label: part.label, rect: { x: place.x, y: place.y, width: place.width, height: place.height } }] : []
  })
  return {
    parts: of('component', { added: added.components, changed: changed.components }),
    lines: of('relationship', { added: added.relationships, changed: changed.relationships }),
    ghosts,
  }
}
