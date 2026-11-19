import type { Board } from '../board/schema'
import { bundleGroups } from '../canvas/bundles'
import { bundleWords } from '../canvas/bundleWords'
import type { Layer } from '../layer/model'
import type { Selection } from './state'

export interface Trail {
  /** The group the selected part sits in. A connection, a link, and a new part have none. */
  group?: { id: string; label: string }
  /** The part or the line, by the name the sidebar gives it. */
  last: { label: string; kind: 'part' | 'line' | 'bundle' }
}

/**
 * The segments after the board in the top bar: where the selection sits. Nothing for the board itself, a drawing,
 * or something that is no longer on the board.
 */
export function trailOf(board: Board, layer: Layer | undefined, selection: Selection | undefined): Trail | undefined {
  if (!selection || selection.type === 'board' || selection.type === 'mark') return undefined
  if (selection.type === 'component') {
    const part = board.components.find((c) => c.id === selection.id)
    if (!part) return undefined
    const group = board.groups.find((g) => g.id === part.group)
    return { ...(group ? { group: { id: group.id, label: group.label } } : {}), last: { label: part.label, kind: 'part' } }
  }
  if (selection.type === 'bundle') {
    const proposals = layer?.proposals ?? []
    const pair = bundleGroups(board, layer?.links ?? [], layer?.reconnects ?? [], proposals).find((p) => p.a === selection.a && p.b === selection.b)
    return pair ? { last: { label: bundleWords(board, proposals, pair).title, kind: 'bundle' } } : undefined
  }
  if (selection.type === 'proposal') {
    const proposal = layer?.proposals.find((p) => p.id === selection.id)
    return proposal ? { last: { label: proposal.label, kind: 'part' } } : undefined
  }
  if (selection.type === 'relationship') {
    const line = board.relationships.find((r) => r.id === selection.id)
    return line ? { last: { label: line.label, kind: 'line' } } : undefined
  }
  const link = layer?.links.find((l) => l.id === selection.id)
  return link ? { last: { label: link.label || 'Link', kind: 'line' } } : undefined
}
