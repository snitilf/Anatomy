import type { Board } from '../board/schema'
import { fingerprintTarget } from './fingerprint'
import { OVERLAY_LIMITS } from './schema'
import type { ManualLink, Note, Overlay, Point, Target } from './types'

export type LinkResult = { ok: true; overlay: Overlay } | { ok: false; overlay: Overlay; error: string }

/** A random lowercase base-36 ID: the prefix, a hyphen, and 12 characters. */
export function newId(prefix: 'note' | 'link'): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let suffix = ''
  for (const b of bytes) suffix += (b % 36).toString(36)
  return `${prefix}-${suffix}`
}

/**
 * Adds a note. Returns the same overlay when the text is empty or too long,
 * the target is not in the board, or the note limit is reached.
 */
export function addNote(
  overlay: Overlay,
  board: Board,
  input: { kind: Note['kind']; text: string; target: Target },
  now: Date,
  id: string,
): Overlay {
  const text = input.text.trim()
  const fingerprint = fingerprintTarget(board, input.target)
  if (text.length === 0 || text.length > OVERLAY_LIMITS.noteText) return overlay
  if (fingerprint === undefined || overlay.notes.length >= OVERLAY_LIMITS.notes) return overlay
  const iso = now.toISOString()
  const note: Note = {
    id,
    kind: input.kind,
    text,
    target: input.target,
    targetFingerprint: fingerprint,
    createdAt: iso,
    updatedAt: iso,
  }
  return { ...overlay, notes: [...overlay.notes, note] }
}

function mapNote(overlay: Overlay, id: string, change: (n: Note) => Note): Overlay {
  if (!overlay.notes.some((n) => n.id === id)) return overlay
  return { ...overlay, notes: overlay.notes.map((n) => (n.id === id ? change(n) : n)) }
}

/** Changes the text only. The fingerprint stays, so an outdated note stays flagged. */
export function editNote(overlay: Overlay, id: string, text: string, now: Date): Overlay {
  const trimmed = text.trim()
  if (trimmed.length === 0 || trimmed.length > OVERLAY_LIMITS.noteText) return overlay
  return mapNote(overlay, id, (n) => ({ ...n, text: trimmed, updatedAt: now.toISOString() }))
}

/** Marks the note as still right: refreshes its fingerprint to the current target. */
export function confirmNote(overlay: Overlay, board: Board, id: string, now: Date): Overlay {
  return mapNote(overlay, id, (n) => {
    const fp = fingerprintTarget(board, n.target)
    return fp === undefined ? n : { ...n, targetFingerprint: fp, updatedAt: now.toISOString() }
  })
}

/** Points a note at another target. Unchanged when the new target is not in the board. */
export function relinkNote(overlay: Overlay, board: Board, id: string, target: Target, now: Date): Overlay {
  const fp = fingerprintTarget(board, target)
  if (fp === undefined) return overlay
  return mapNote(overlay, id, (n) => ({ ...n, target, targetFingerprint: fp, updatedAt: now.toISOString() }))
}

export function deleteNote(overlay: Overlay, id: string): Overlay {
  if (!overlay.notes.some((n) => n.id === id)) return overlay
  return { ...overlay, notes: overlay.notes.filter((n) => n.id !== id) }
}

function checkEnds(board: Board, from: string, to: string): string | undefined {
  if (from === to) return 'A link needs two different parts.'
  const ids = new Set(board.components.map((c) => c.id))
  if (!ids.has(from)) return `There is no part "${from}".`
  if (!ids.has(to)) return `There is no part "${to}".`
  return undefined
}

/** The board is needed to check that both ends exist. */
export function addManualLink(
  overlay: Overlay,
  input: { from: string; to: string; label: string },
  now: Date,
  id: string,
  board: Board,
): LinkResult {
  const error = checkEnds(board, input.from, input.to)
  if (error) return { ok: false, overlay, error }
  const label = input.label.trim()
  if (label.length > OVERLAY_LIMITS.linkLabel) return { ok: false, overlay, error: 'The label is too long.' }
  if (overlay.manualLinks.length >= OVERLAY_LIMITS.manualLinks) {
    return { ok: false, overlay, error: 'There are too many links.' }
  }
  const link: ManualLink = { id, from: input.from, to: input.to, label, createdAt: now.toISOString() }
  return { ok: true, overlay: { ...overlay, manualLinks: [...overlay.manualLinks, link] } }
}

export function editManualLink(
  overlay: Overlay,
  id: string,
  change: { from?: string; to?: string; label?: string },
  board: Board,
): LinkResult {
  const existing = overlay.manualLinks.find((l) => l.id === id)
  if (!existing) return { ok: false, overlay, error: 'There is no such link.' }
  const from = change.from ?? existing.from
  const to = change.to ?? existing.to
  const label = (change.label ?? existing.label).trim()
  const error = checkEnds(board, from, to)
  if (error) return { ok: false, overlay, error }
  if (label.length > OVERLAY_LIMITS.linkLabel) return { ok: false, overlay, error: 'The label is too long.' }
  return {
    ok: true,
    overlay: { ...overlay, manualLinks: overlay.manualLinks.map((l) => (l.id === id ? { ...l, from, to, label } : l)) },
  }
}

export function deleteManualLink(overlay: Overlay, id: string): Overlay {
  if (!overlay.manualLinks.some((l) => l.id === id)) return overlay
  return { ...overlay, manualLinks: overlay.manualLinks.filter((l) => l.id !== id) }
}

/** Stores a user-set card position. Non-finite or out-of-range points are ignored. */
export function setPosition(overlay: Overlay, componentId: string, point: Point): Overlay {
  const lim = OVERLAY_LIMITS.coordinate
  const ok = (n: number) => Number.isFinite(n) && Math.abs(n) <= lim
  if (!ok(point.x) || !ok(point.y)) return overlay
  if (!Object.hasOwn(overlay.positions, componentId) && Object.keys(overlay.positions).length >= OVERLAY_LIMITS.positions) {
    return overlay
  }
  return { ...overlay, positions: { ...overlay.positions, [componentId]: { x: point.x, y: point.y } } }
}
