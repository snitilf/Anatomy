import type { Board } from '../board/schema'
import { fingerprintTarget } from './fingerprint'
import type { ManualLink, Note, NoteStatus, Overlay } from './types'

export function noteStatus(board: Board, note: Note): NoteStatus {
  const current = fingerprintTarget(board, note.target)
  if (current === undefined) return 'needs-relinking'
  return current === note.targetFingerprint ? 'current' : 'possibly-outdated'
}

export function manualLinkStatus(board: Board, link: ManualLink): 'current' | 'needs-relinking' {
  const ids = new Set(board.components.map((c) => c.id))
  return ids.has(link.from) && ids.has(link.to) ? 'current' : 'needs-relinking'
}

export interface OverlaySummary {
  outdated: Note[]
  needsRelinking: Note[]
  brokenLinks: ManualLink[]
}

export function summarizeOverlay(board: Board, overlay: Overlay): OverlaySummary {
  const outdated: Note[] = []
  const needsRelinking: Note[] = []
  for (const note of overlay.notes) {
    const status = noteStatus(board, note)
    if (status === 'possibly-outdated') outdated.push(note)
    else if (status === 'needs-relinking') needsRelinking.push(note)
  }
  const brokenLinks = overlay.manualLinks.filter((l) => manualLinkStatus(board, l) === 'needs-relinking')
  return { outdated, needsRelinking, brokenLinks }
}
