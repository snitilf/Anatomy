import type { Board } from '../board/schema'
import type { Target } from '../overlay/types'

/** A target as the plain value of a select option. */
export function encodeTarget(target: Target): string {
  return target.type === 'board' ? 'board' : `${target.type}:${target.id}`
}

export function decodeTarget(value: string): Target | undefined {
  if (value === 'board') return { type: 'board' }
  const colon = value.indexOf(':')
  if (colon < 0) return undefined
  const type = value.slice(0, colon)
  const id = value.slice(colon + 1)
  return type === 'component' || type === 'relationship' ? { type, id } : undefined
}

export function sameTarget(a: Target, b: Target): boolean {
  return encodeTarget(a) === encodeTarget(b)
}

/** What a note is attached to, in words. Falls back to the ID when the part is gone. */
export function targetName(board: Board, target: Target): string {
  if (target.type === 'board') return 'The whole board'
  if (target.type === 'component') return board.components.find((c) => c.id === target.id)?.label ?? target.id
  const r = board.relationships.find((x) => x.id === target.id)
  if (!r) return target.id
  const names = new Map(board.components.map((c) => [c.id, c.label]))
  return `${names.get(r.from) ?? r.from} to ${names.get(r.to) ?? r.to}: ${r.label}`
}
