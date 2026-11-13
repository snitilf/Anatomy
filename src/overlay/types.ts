import type { Board } from '../board/schema'

/** What a note or question is attached to. */
export type Target =
  | { type: 'board' }
  | { type: 'component'; id: string }
  | { type: 'relationship'; id: string }

export interface Point {
  x: number
  y: number
}

export interface Note {
  /** "note-" followed by a random suffix. */
  id: string
  kind: 'note' | 'question'
  /** Plain text, 1 to 2000 characters. */
  text: string
  target: Target
  /** Fingerprint of the target when the note was written or last confirmed. */
  targetFingerprint: string
  createdAt: string
  updatedAt: string
}

/** An arrow the user drew. Always a human annotation. */
export interface ManualLink {
  /** "link-" followed by a random suffix. */
  id: string
  from: string
  to: string
  /** 0 to 60 characters. */
  label: string
  createdAt: string
}

/** Everything the user adds on top of a board. Stored and exported apart from the board. */
export interface Overlay {
  format: 'anatomy-overlay'
  schemaVersion: 1
  boardId: string
  /** Card positions set by the user, by component ID. */
  positions: Record<string, Point>
  notes: Note[]
  manualLinks: ManualLink[]
}

export type NoteStatus = 'current' | 'possibly-outdated' | 'needs-relinking'

/** A board file plus the user's overlay, in one portable file. */
export interface ExportFile {
  format: 'anatomy-export'
  schemaVersion: 1
  exportedAt: string
  board: Board
  overlay: Overlay
}

export function emptyOverlay(boardId: string): Overlay {
  return { format: 'anatomy-overlay', schemaVersion: 1, boardId, positions: {}, notes: [], manualLinks: [] }
}
