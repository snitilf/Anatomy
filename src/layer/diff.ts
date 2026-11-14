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

const COMPONENT_FIELDS = { label: 'name', summary: 'summary', explanation: 'explanation', group: 'group', inputs: 'inputs', outputs: 'outputs', source: 'source' } as const
const RELATIONSHIP_FIELDS = { from: 'start', to: 'end', kind: 'kind', label: 'label', explanation: 'explanation', source: 'source' } as const
const BOARD_FIELDS = { title: 'title', goal: 'goal', scope: 'scope' } as const

function fieldsThatDiffer<T extends object>(before: T, after: T, names: Partial<Record<keyof T, string>>): string[] {
  return (Object.keys(names) as (keyof T)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map((k) => names[k] as string)
}

/**
 * The fields of one part, connection, or the board that differ between two revisions, in plain words.
 * Empty when the target is missing from either revision, or nothing differs.
 */
export function changedFields(prev: Board, next: Board, target: { type: 'board' } | { type: 'component' | 'relationship'; id: string }): string[] {
  if (target.type === 'board') return fieldsThatDiffer(prev, next, BOARD_FIELDS)
  if (target.type === 'component') {
    const a = prev.components.find((c) => c.id === target.id)
    const b = next.components.find((c) => c.id === target.id)
    return a && b ? fieldsThatDiffer(a, b, COMPONENT_FIELDS) : []
  }
  const a = prev.relationships.find((r) => r.id === target.id)
  const b = next.relationships.find((r) => r.id === target.id)
  return a && b ? fieldsThatDiffer(a, b, RELATIONSHIP_FIELDS) : []
}
