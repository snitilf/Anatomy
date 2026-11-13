import type { Board } from '../board/schema'
import { fingerprintBoard, fingerprintComponent, fingerprintRelationship } from './fingerprint'

export interface IdChanges {
  components: string[]
  relationships: string[]
}

export interface BoardDiff {
  added: IdChanges
  removed: IdChanges
  changed: IdChanges
  boardChanged: boolean
}

function compare<T extends { id: string }>(prev: T[], next: T[], print: (x: T) => string) {
  const before = new Map(prev.map((x) => [x.id, print(x)] as const))
  const after = new Map(next.map((x) => [x.id, print(x)] as const))
  const added = [...after.keys()].filter((id) => !before.has(id))
  const removed = [...before.keys()].filter((id) => !after.has(id))
  const changed = [...after].filter(([id, fp]) => before.has(id) && before.get(id) !== fp).map(([id]) => id)
  return { added, removed, changed }
}

/** Compares two versions of a board by content fingerprint. Positions are ignored. */
export function diffBoards(prev: Board, next: Board): BoardDiff {
  const c = compare(prev.components, next.components, fingerprintComponent)
  const r = compare(prev.relationships, next.relationships, fingerprintRelationship)
  return {
    added: { components: c.added, relationships: r.added },
    removed: { components: c.removed, relationships: r.removed },
    changed: { components: c.changed, relationships: r.changed },
    boardChanged: fingerprintBoard(prev) !== fingerprintBoard(next),
  }
}
