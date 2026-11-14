import type { Board } from '../board/schema'
import { fingerprintTarget } from './fingerprint'
import type { Layer, Link, Note, NoteStatus } from './model'

export function noteStatus(board: Board, note: Note): NoteStatus {
  const current = fingerprintTarget(board, note.target)
  if (current === undefined) return 'needs-relinking'
  return current === note.targetFingerprint ? 'current' : 'possibly-outdated'
}

/** A link is broken when one of its parts left the board. Links to the user's proposed parts break only with them. */
export function linkStatus(board: Board, layer: Pick<Layer, 'proposals'>, link: Link): 'current' | 'needs-relinking' {
  const ids = new Set([...board.components.map((c) => c.id), ...layer.proposals.map((p) => p.id)])
  return ids.has(link.from) && ids.has(link.to) ? 'current' : 'needs-relinking'
}

export interface LayerSummary {
  outdated: Note[]
  needsRelinking: Note[]
  brokenLinks: Link[]
}

export function summarizeLayer(board: Board, layer: Pick<Layer, 'notes' | 'links' | 'proposals'>): LayerSummary {
  const outdated: Note[] = []
  const needsRelinking: Note[] = []
  for (const note of layer.notes) {
    const status = noteStatus(board, note)
    if (status === 'possibly-outdated') outdated.push(note)
    else if (status === 'needs-relinking') needsRelinking.push(note)
  }
  const brokenLinks = layer.links.filter((l) => linkStatus(board, layer, l) === 'needs-relinking')
  return { outdated, needsRelinking, brokenLinks }
}
