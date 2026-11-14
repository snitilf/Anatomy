import type { Board } from '../board/schema'
import { placeCards } from '../layout/cards'
import { center, contains, inflate, overlaps, type Point, type Rect } from '../layout/geometry'
import { fingerprintValue } from '../layer/fingerprint'
import { itemsOf, type Item, type Layer, type Mark, type MarkEnd, type Sent } from '../layer/model'
import { noteStatus } from '../layer/status'
import type { Feedback, FeedbackItem, MissingRef, PartRef, Pointed, Ref, SkipReason } from './types'

export interface FeedbackDraft {
  feedback: Feedback
  /** Items that say nothing the agent could use, such as a drawing with no note that touches nothing. */
  skipped: { id: string; reason: SkipReason }[]
  /** What to store in the layer once the feedback has been handed over. */
  sent: Sent
}

/** How close, in board units, a line must come to a part or a connection to touch it. */
const REACH = 8
/** Outlines are checked at points this far apart. */
const SAMPLE = 6

interface Scene {
  parts: { ref: PartRef; rect: Rect }[]
  connections: { ref: Ref & { type: 'relationship' }; a: Point; b: Point }[]
  part: (id: string) => PartRef | MissingRef
}

/** The board as the user saw it: every part with its rectangle, and every connection as a line between part centers. */
function sceneOf(board: Board, layer: Layer): Scene {
  const rects = placeCards(board, layer)
  const parts: Scene['parts'] = []
  for (const c of board.components) {
    const rect = rects[c.id]
    if (rect) parts.push({ ref: { type: 'component', id: c.id, label: c.label }, rect })
  }
  for (const p of layer.proposals) parts.push({ ref: { type: 'new-part', id: p.id, label: p.label }, rect: { x: p.x, y: p.y, width: p.width, height: p.height } })
  const byId = new Map(parts.map((p) => [p.ref.id, p]))
  const connections: Scene['connections'] = []
  for (const r of board.relationships) {
    const from = byId.get(r.from)
    const to = byId.get(r.to)
    if (from && to) connections.push({ ref: { type: 'relationship', id: r.id, label: r.label, from: r.from, to: r.to }, a: center(from.rect), b: center(to.rect) })
  }
  return { parts, connections, part: (id) => byId.get(id)?.ref ?? { type: 'missing', id } }
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Points along a path, no more than SAMPLE apart, so a long straight run still meets the parts it crosses. */
function sampled(path: readonly Point[], closed: boolean): Point[] {
  const out: Point[] = []
  const corners = closed && path.length > 1 ? [...path, path[0] as Point] : path
  corners.forEach((p, i) => {
    const q = corners[i + 1]
    out.push(p)
    if (!q) return
    const steps = Math.floor(Math.hypot(q.x - p.x, q.y - p.y) / SAMPLE)
    for (let s = 1; s < steps; s++) out.push({ x: p.x + ((q.x - p.x) * s) / steps, y: p.y + ((q.y - p.y) * s) / steps })
  })
  return out
}

function insidePolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i] as Point
    const b = polygon[j] as Point
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** The outline of a mark as a path, and whether it closes on itself. */
function outlineOf(mark: Extract<Mark, { kind: 'stroke' | 'rect' | 'ellipse' }>): { path: Point[]; closed: boolean } {
  if (mark.kind === 'stroke') {
    const first = mark.points[0] as Point
    const last = mark.points[mark.points.length - 1] as Point
    const xs = mark.points.map((p) => p.x)
    const ys = mark.points.map((p) => p.y)
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    // A loop drawn by hand rarely meets its start exactly. A gap of a quarter of its size still reads as closed.
    const closed = mark.points.length > 2 && Math.hypot(last.x - first.x, last.y - first.y) <= Math.max(30, span / 4)
    return { path: mark.points, closed }
  }
  const { x, y, width, height } = mark
  if (mark.kind === 'rect') return { path: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], closed: true }
  const path: Point[] = []
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2
    path.push({ x: x + width / 2 + (Math.cos(t) * width) / 2, y: y + height / 2 + (Math.sin(t) * height) / 2 })
  }
  return { path, closed: true }
}

/** What a drawn outline encloses (a part's middle, or a connection's middle, inside it) and what its line touches. */
function resolveOutline(scene: Scene, path: readonly Point[], closed: boolean): { encloses: Ref[]; touches: Ref[] } {
  const line = sampled(path, closed)
  const encloses: Ref[] = []
  const touches: Ref[] = []
  for (const { ref, rect } of scene.parts) {
    if (closed && insidePolygon(center(rect), path)) encloses.push(ref)
    else if (line.some((p) => contains(inflate(rect, REACH), p))) touches.push(ref)
  }
  for (const { ref, a, b } of scene.connections) {
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    if (closed && insidePolygon(middle, path)) encloses.push(ref)
    else if (line.some((p) => distanceToSegment(p, a, b) <= REACH)) touches.push(ref)
  }
  return { encloses, touches }
}

/** The part or connection an arrow end lies on. A part wins over a connection that runs under it. */
function resolveEnd(scene: Scene, end: MarkEnd, board: Board): Pointed {
  if (end.type === 'part') return scene.part(end.id)
  if (end.type === 'relationship') {
    const found = scene.connections.find((c) => c.ref.id === end.id)?.ref
    if (found) return found
    return board.relationships.some((r) => r.id === end.id) ? { type: 'point' } : { type: 'missing', id: end.id }
  }
  const part = scene.parts.find(({ rect }) => contains(inflate(rect, REACH), end))
  if (part) return part.ref
  const line = scene.connections.find(({ a, b }) => distanceToSegment(end, a, b) <= REACH)
  return line ? line.ref : { type: 'point' }
}

const withNote = (note: string | undefined) => (note === undefined ? {} : { note })

function describeMark(scene: Scene, board: Board, mark: Mark): FeedbackItem | undefined {
  switch (mark.kind) {
    case 'stroke':
    case 'rect':
    case 'ellipse': {
      const { path, closed } = outlineOf(mark)
      const found = resolveOutline(scene, path, closed)
      if (mark.note === undefined && found.encloses.length + found.touches.length === 0) return undefined
      return mark.kind === 'stroke'
        ? { id: mark.id, type: 'drawing', ...withNote(mark.note), ...found }
        : { id: mark.id, type: 'shape', shape: mark.kind, ...withNote(mark.note), ...found }
    }
    case 'arrow': {
      const from = resolveEnd(scene, mark.from, board)
      const to = resolveEnd(scene, mark.to, board)
      if (mark.note === undefined && from.type === 'point' && to.type === 'point') return undefined
      return { id: mark.id, type: 'arrow', ...withNote(mark.note), from, to }
    }
    case 'text':
    case 'sticky': {
      if (mark.text === '' && mark.note === undefined) return undefined
      const area = inflate(mark, REACH * 2)
      const on: Ref[] = scene.parts.filter(({ rect }) => overlaps(area, rect)).map((p) => p.ref)
      return { id: mark.id, type: mark.kind, text: mark.text, ...withNote(mark.note), on }
    }
  }
}

function describe(scene: Scene, board: Board, layer: Layer, entry: Item): FeedbackItem | undefined {
  switch (entry.type) {
    case 'note': {
      const n = entry.item
      const status = noteStatus(board, n)
      const target = n.target
      const about =
        target.type === 'board'
          ? { type: 'board' as const }
          : target.type === 'component'
            ? scene.part(target.id)
            : (scene.connections.find((c) => c.ref.id === target.id)?.ref ?? ({ type: 'missing', id: target.id } as const))
      return { id: n.id, type: n.kind, text: n.text, about, ...(status === 'current' ? {} : { status }) }
    }
    case 'link': {
      const l = entry.item
      return { id: l.id, type: 'link', from: scene.part(l.from), to: scene.part(l.to), label: l.label }
    }
    case 'reconnect': {
      const r = entry.item
      const original = board.relationships.find((x) => x.id === r.relationshipId)
      if (!original) return undefined
      return {
        id: r.id,
        type: 'reconnect',
        connection: { id: original.id, label: original.label, kind: original.kind },
        was: { from: scene.part(original.from), to: scene.part(original.to) },
        now: { from: scene.part(r.from ?? original.from), to: scene.part(r.to ?? original.to) },
      }
    }
    case 'proposal': {
      const p = entry.item
      const links = layer.links
        .filter((l) => l.from === p.id || l.to === p.id)
        .map((l) => ({ id: l.id, direction: l.from === p.id ? ('to' as const) : ('from' as const), part: scene.part(l.from === p.id ? l.to : l.from), label: l.label }))
      const area = inflate(p, 60)
      const near = scene.parts.filter(({ ref, rect }) => ref.id !== p.id && overlaps(area, rect)).map((x) => x.ref)
      return { id: p.id, type: 'new-part', label: p.label, summary: p.summary, links, near }
    }
    case 'mark':
      return describeMark(scene, board, entry.item)
  }
}

/**
 * Turns the user's layer into feedback for the agent. Only items that are new, or changed since they were last sent,
 * go in. Pure: the caller supplies the ID and the time, and stores `sent` once the file is written.
 */
export function buildFeedback(board: Board, layer: Layer, options: { id: string; now: Date }): FeedbackDraft {
  const scene = sceneOf(board, layer)
  const before = new Map((layer.sent?.items ?? []).map((s) => [s.id, s.fingerprint]))
  const live = new Set<string>()
  const items: FeedbackItem[] = []
  const skipped: FeedbackDraft['skipped'] = []
  const record: Sent['items'] = []

  for (const entry of itemsOf(layer)) {
    const id = entry.item.id
    live.add(id)
    const fingerprint = fingerprintValue(entry.item)
    if (before.get(id) === fingerprint) {
      record.push({ id, fingerprint })
      continue
    }
    const item = describe(scene, board, layer, entry)
    if (!item) {
      skipped.push({ id, reason: 'no-meaning' })
      continue
    }
    items.push(item)
    record.push({ id, fingerprint })
  }

  const archived = new Set(layer.archive.map((e) => e.item.id))
  const withdrawn = [...before.keys()].filter((id) => !live.has(id) && !archived.has(id))
  const createdAt = options.now.toISOString()
  return {
    feedback: { format: 'anatomy-feedback', schemaVersion: 1, id: options.id, boardId: board.id, baseRevision: board.revision, createdAt, items, withdrawn },
    skipped,
    sent: { feedbackId: options.id, baseRevision: board.revision, at: createdAt, items: record },
  }
}

/** What the agent will be told about one mark, or undefined when the mark says nothing it could use. */
export function describeMarkFor(board: Board, layer: Layer, mark: Mark): FeedbackItem | undefined {
  return describeMark(sceneOf(board, layer), board, mark)
}
