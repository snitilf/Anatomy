import type { Board } from '../board/schema'
import { computeGeometry, editedId } from '../canvas/buildGraph'
import { placeCards } from '../layout/cards'
import { center, contains, inflate, overlaps, type Point, type Rect } from '../layout/geometry'
import { fingerprintValue } from '../layer/fingerprint'
import { itemsOf, type Item, type Layer, type Mark, type MarkEnd, type Note, type Sent } from '../layer/model'
import { noteStatus } from '../layer/status'
import { nearestOnLine, pointAlong, type Scene as MapScene } from '../whiteboard/geometry'
import type { ConnectionRef, Feedback, FeedbackItem, MissingRef, PartRef, Pointed, Ref, SkipReason, Snapshot } from './types'

export interface FeedbackDraft {
  feedback: Feedback
  /** Items that say nothing the agent could use, such as a drawing with no note that touches nothing. */
  skipped: { id: string; reason: SkipReason }[]
  /** Items that are new or changed since the last send. */
  fresh: string[]
  /** Items sent before that have no answer yet. They go again, so a second send never drops them. */
  again: string[]
  /** What to store in the layer once the feedback has been handed over. */
  sent: Sent
}

/** How close, in board units, a line must come to a part or a connection to touch it. */
const REACH = 8
/** Outlines are checked at points this far apart. */
const SAMPLE = 6

interface Scene {
  parts: { ref: PartRef; rect: Rect }[]
  /** Each connection as it is drawn: routed around the cards, and along the user's line when they moved an end. */
  connections: { ref: ConnectionRef; line: readonly Point[] }[]
  part: (id: string) => PartRef | MissingRef
}

/** The map as a fresh build draws it, for callers that have no map open, such as tests. */
export function mapSceneOf(board: Board, layer: Layer): MapScene {
  const rects: Record<string, Rect> = placeCards(board, layer)
  for (const p of layer.proposals) rects[p.id] = { x: p.x, y: p.y, width: p.width, height: p.height }
  const geometry = computeGeometry(board, rects, layer.links, undefined, layer.reconnects)
  const lines = new Map<string, readonly Point[]>()
  for (const r of board.relationships) {
    const shape = geometry.edges.get(editedId(r.id)) ?? geometry.edges.get(r.id)
    if (shape) lines.set(r.id, shape.points)
  }
  return { rects, lines }
}

/** The board as the user saw it: every part with its rectangle, and every connection along its drawn line. */
function sceneOf(board: Board, layer: Layer, map: MapScene = mapSceneOf(board, layer)): Scene {
  const parts: Scene['parts'] = []
  for (const c of board.components) {
    const rect = map.rects[c.id]
    if (rect) parts.push({ ref: { type: 'component', id: c.id, label: c.label }, rect })
  }
  for (const p of layer.proposals) {
    const rect = map.rects[p.id] ?? { x: p.x, y: p.y, width: p.width, height: p.height }
    parts.push({ ref: { type: 'new-part', id: p.id, label: p.label }, rect })
  }
  const connections: Scene['connections'] = []
  for (const r of board.relationships) {
    const line = map.lines.get(r.id)
    if (line && line.length > 0) connections.push({ ref: { type: 'relationship', id: r.id, label: r.label, from: r.from, to: r.to }, line })
  }
  const byId = new Map(parts.map((p) => [p.ref.id, p]))
  return { parts, connections, part: (id) => byId.get(id)?.ref ?? { type: 'missing', id } }
}

const nearLine = (line: readonly Point[], p: Point) => (nearestOnLine(line, p)?.distance ?? Infinity) <= REACH
const round2 = (n: number) => Math.round(n * 100) / 100

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
  for (const { ref, line: drawn } of scene.connections) {
    const middle = pointAlong(drawn, 0.5)
    if (closed && middle && insidePolygon(middle, path)) encloses.push(ref)
    else {
      const xs = drawn.map((p) => p.x)
      const ys = drawn.map((p) => p.y)
      const left = Math.min(...xs) - REACH
      const right = Math.max(...xs) + REACH
      const top = Math.min(...ys) - REACH
      const bottom = Math.max(...ys) + REACH
      if (line.some((p) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom && nearLine(drawn, p))) touches.push(ref)
    }
  }
  return { encloses, touches }
}

/**
 * The part or connection an arrow end lies on. A part wins over a connection that runs under it.
 * On a connection, `at` says where along the drawn line: 0 at its start, 1 at its end.
 */
function resolveEnd(scene: Scene, end: MarkEnd, board: Board): Pointed {
  if (end.type === 'part') return scene.part(end.id)
  if (end.type === 'relationship') {
    const found = scene.connections.find((c) => c.ref.id === end.id)?.ref
    if (found) return { ...found, at: round2(end.t ?? 0.5) }
    return board.relationships.some((r) => r.id === end.id) ? { type: 'point' } : { type: 'missing', id: end.id }
  }
  const part = scene.parts.find(({ rect }) => contains(inflate(rect, REACH), end))
  if (part) return part.ref
  let best: { ref: ConnectionRef; t: number; distance: number } | undefined
  for (const { ref, line } of scene.connections) {
    const on = nearestOnLine(line, end)
    if (on && on.distance <= REACH && (!best || on.distance < best.distance)) best = { ref, t: on.t, distance: on.distance }
  }
  return best ? { ...best.ref, at: round2(best.t) } : { type: 'point' }
}

/** What the note's target said in this revision. */
function snapshotOf(board: Board, note: Note): Snapshot | undefined {
  const target = note.target
  if (target.type === 'board') return { type: 'board', title: board.title, goal: board.goal }
  if (target.type === 'component') {
    const c = board.components.find((x) => x.id === target.id)
    return c ? { type: 'component', label: c.label, summary: c.summary } : undefined
  }
  const r = board.relationships.find((x) => x.id === target.id)
  if (!r) return undefined
  const name = (id: string) => board.components.find((c) => c.id === id)?.label ?? id
  return { type: 'relationship', label: r.label, kind: r.kind, from: name(r.from), to: name(r.to) }
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
      const snapshot = snapshotOf(board, n)
      return { id: n.id, type: n.kind, text: n.text, about, ...(snapshot ? { snapshot } : {}), ...(status === 'current' ? {} : { status }) }
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
 * Turns the user's layer into feedback for the agent: every item that is new or changed since the last send, and every
 * item sent before that the agent has not answered yet. Pure: the caller supplies the ID and the time, and stores `sent`
 * once the file is written. Pass the map's `scene` so marks are read against the lines the user sees.
 */
export function buildFeedback(board: Board, layer: Layer, options: { id: string; now: Date; scene?: MapScene | undefined }): FeedbackDraft {
  const scene = sceneOf(board, layer, options.scene)
  const before = new Map((layer.sent?.items ?? []).map((s) => [s.id, s.fingerprint]))
  const answered = new Set(layer.answers.map((a) => a.id))
  const live = new Set<string>()
  const items: FeedbackItem[] = []
  const skipped: FeedbackDraft['skipped'] = []
  const fresh: string[] = []
  const again: string[] = []
  const record: Sent['items'] = []

  for (const entry of itemsOf(layer)) {
    const id = entry.item.id
    live.add(id)
    const fingerprint = fingerprintValue(entry.item)
    const changed = before.get(id) !== fingerprint
    if (!changed && answered.has(id)) {
      record.push({ id, fingerprint })
      continue
    }
    const item = describe(scene, board, layer, entry)
    if (!item) {
      // Something sent before can lose its meaning when the board changes under it. It is not new, so it is not listed.
      if (changed) skipped.push({ id, reason: 'no-meaning' })
      else record.push({ id, fingerprint })
      continue
    }
    items.push(item)
    record.push({ id, fingerprint })
    ;(changed ? fresh : again).push(id)
  }

  const archived = new Set(layer.archive.map((e) => e.item.id))
  const withdrawn = [...before.keys()].filter((id) => !live.has(id) && !archived.has(id))
  const createdAt = options.now.toISOString()
  return {
    feedback: { format: 'anatomy-feedback', schemaVersion: 1, id: options.id, boardId: board.id, baseRevision: board.revision, createdAt, items, withdrawn },
    skipped,
    fresh,
    again,
    sent: { feedbackId: options.id, baseRevision: board.revision, at: createdAt, items: record },
  }
}

/** How many things a send would hand over that the agent has not seen: new or changed items, and deleted ones. */
export function unsentCount(draft: FeedbackDraft): number {
  return draft.fresh.length + draft.feedback.withdrawn.length
}

/** What the agent will be told about one mark, or undefined when the mark says nothing it could use. */
export function describeMarkFor(board: Board, layer: Layer, mark: Mark, scene?: MapScene): FeedbackItem | undefined {
  return describeMark(sceneOf(board, layer, scene), board, mark)
}

/** The feedback file as it is written to `.anatomy/feedback.json`. */
export function serializeFeedback(feedback: Feedback): string {
  return `${JSON.stringify(feedback, null, 2)}\n`
}
