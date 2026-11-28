import type { Board } from '../board/schema'
import type { Point, Size } from '../layout/geometry'
import { fingerprintTarget } from './fingerprint'
import {
  archiveEntry,
  LAYER_LIMITS,
  mark as markSchema,
  proposal as proposalSchema,
  type ArchiveEntry,
  type IdPrefix,
  type Item,
  type ItemType,
  type Layer,
  type Link,
  type Mark,
  type Note,
  type Proposal,
  type Reconnect,
  type Response,
  type Sent,
  type Target,
} from './model'

/**
 * Every change the user makes to a layer. Each function is pure: it returns a new layer, or the same layer object when
 * the change is not allowed or changes nothing, so callers can tell a no-op by identity.
 */

export type EditResult = { ok: true; layer: Layer } | { ok: false; layer: Layer; error: string }

/** A random lowercase base-36 ID: the prefix, a hyphen, and 12 characters. */
export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let suffix = ''
  for (const b of bytes) suffix += (b % 36).toString(36)
  return `${prefix}-${suffix}`
}

const COLLECTION = { note: 'notes', link: 'links', mark: 'marks', proposal: 'proposals', reconnect: 'reconnects' } as const

type Collection<K extends ItemType> = Extract<Item, { type: K }>['item'][]
type Entry = { id: string }

function list<K extends ItemType>(layer: Layer, type: K): Collection<K> {
  return layer[COLLECTION[type]] as Collection<K>
}

function withList(layer: Layer, type: ItemType, items: readonly Entry[]): Layer {
  return { ...layer, [COLLECTION[type]]: items }
}

/** Replaces one item by ID. The same layer when there is no such item or the change returns it unchanged. */
function mapItem<K extends ItemType>(layer: Layer, type: K, id: string, change: (item: Collection<K>[number]) => Collection<K>[number]): Layer {
  const items: readonly Entry[] = list(layer, type)
  const at = items.findIndex((x) => x.id === id)
  if (at < 0) return layer
  const before = items[at] as Collection<K>[number]
  const after = change(before)
  if (after === before) return layer
  return withList(layer, type, items.map((x, i) => (i === at ? after : x)))
}

/** Removes one item, and the agent's answer to it, and the mark that the answer was kept. */
function removeItem(layer: Layer, type: ItemType, id: string): Layer {
  const items: readonly Entry[] = list(layer, type)
  if (!items.some((x) => x.id === id)) return layer
  const removed = withList(layer, type, items.filter((x) => x.id !== id))
  if (!layer.answers.some((a) => a.id === id) && !layer.kept.includes(id)) return removed
  return { ...removed, answers: layer.answers.filter((a) => a.id !== id), kept: layer.kept.filter((k) => k !== id) }
}

/** Finds any of the user's items by ID. */
export function findItem(layer: Layer, id: string): Item | undefined {
  for (const type of Object.keys(COLLECTION) as ItemType[]) {
    const item = (list(layer, type) as readonly Entry[]).find((x) => x.id === id)
    if (item) return { type, item } as Item
  }
  return undefined
}

// Notes

/**
 * Adds a note. Returns the same layer when the text is empty or too long,
 * the target is not in the board, or the note limit is reached.
 */
export function addNote(layer: Layer, board: Board, input: { kind: Note['kind']; text: string; target: Target }, now: Date, id: string): Layer {
  const text = input.text.trim()
  const fingerprint = fingerprintTarget(board, input.target)
  if (text.length === 0 || text.length > LAYER_LIMITS.noteText) return layer
  if (fingerprint === undefined || layer.notes.length >= LAYER_LIMITS.notes) return layer
  const iso = now.toISOString()
  const note: Note = { id, kind: input.kind, text, target: input.target, targetFingerprint: fingerprint, createdAt: iso, updatedAt: iso }
  return { ...layer, notes: [...layer.notes, note] }
}

/** Changes the text only. The fingerprint stays, so an outdated note stays flagged. */
export function editNote(layer: Layer, id: string, text: string, now: Date): Layer {
  const trimmed = text.trim()
  if (trimmed.length === 0 || trimmed.length > LAYER_LIMITS.noteText) return layer
  return mapItem(layer, 'note', id, (n) => (n.text === trimmed ? n : { ...n, text: trimmed, updatedAt: now.toISOString() }))
}

/** Marks the note as still right: refreshes its fingerprint to the current target. */
export function confirmNote(layer: Layer, board: Board, id: string, now: Date): Layer {
  return mapItem(layer, 'note', id, (n) => {
    const fp = fingerprintTarget(board, n.target)
    return fp === undefined ? n : { ...n, targetFingerprint: fp, updatedAt: now.toISOString() }
  })
}

/** Points a note at another target. Unchanged when the new target is not in the board. */
export function relinkNote(layer: Layer, board: Board, id: string, target: Target, now: Date): Layer {
  const fp = fingerprintTarget(board, target)
  if (fp === undefined) return layer
  return mapItem(layer, 'note', id, (n) => ({ ...n, target, targetFingerprint: fp, updatedAt: now.toISOString() }))
}

export const deleteNote = (layer: Layer, id: string): Layer => removeItem(layer, 'note', id)

// Parts and links

/** Every part a link can join: the board's components and the user's proposed parts. */
export function partIds(board: Board, layer: Layer): Set<string> {
  return new Set([...board.components.map((c) => c.id), ...layer.proposals.map((p) => p.id)])
}

function checkEnds(board: Board, layer: Layer, from: string, to: string): string | undefined {
  if (from === to) return 'A link needs two different parts.'
  const ids = partIds(board, layer)
  if (!ids.has(from)) return `There is no part "${from}".`
  if (!ids.has(to)) return `There is no part "${to}".`
  return undefined
}

export function addLink(layer: Layer, board: Board, input: { from: string; to: string; label: string }, now: Date, id: string): EditResult {
  const error = checkEnds(board, layer, input.from, input.to)
  if (error) return { ok: false, layer, error }
  const label = input.label.trim()
  if (label.length > LAYER_LIMITS.linkLabel) return { ok: false, layer, error: 'The label is too long.' }
  if (layer.links.length >= LAYER_LIMITS.links) return { ok: false, layer, error: 'There are too many links.' }
  const link: Link = { id, from: input.from, to: input.to, label, createdAt: now.toISOString() }
  return { ok: true, layer: { ...layer, links: [...layer.links, link] } }
}

export function editLink(layer: Layer, board: Board, id: string, change: { from?: string; to?: string; label?: string }): EditResult {
  const existing = layer.links.find((l) => l.id === id)
  if (!existing) return { ok: false, layer, error: 'There is no such link.' }
  const from = change.from ?? existing.from
  const to = change.to ?? existing.to
  const label = (change.label ?? existing.label).trim()
  const error = checkEnds(board, layer, from, to)
  if (error) return { ok: false, layer, error }
  if (label.length > LAYER_LIMITS.linkLabel) return { ok: false, layer, error: 'The label is too long.' }
  if (from === existing.from && to === existing.to && label === existing.label) return { ok: true, layer }
  return { ok: true, layer: mapItem(layer, 'link', id, (l) => ({ ...l, from, to, label })) }
}

export const deleteLink = (layer: Layer, id: string): Layer => removeItem(layer, 'link', id)

// Cards

const inRange = (n: number, limit: number, min = -limit) => Number.isFinite(n) && n >= min && n <= limit

/**
 * Stores the positions the user gave cards, as one change. Points out of range are ignored,
 * and a card already at its point is left alone.
 */
export function moveCards(layer: Layer, moves: Readonly<Record<string, Point>>): Layer {
  let positions: Layer['positions'] | undefined
  for (const [id, p] of Object.entries(moves)) {
    if (!inRange(p.x, LAYER_LIMITS.coordinate) || !inRange(p.y, LAYER_LIMITS.coordinate)) continue
    const current = positions ?? layer.positions
    const known = Object.hasOwn(current, id)
    if (known && current[id]?.x === p.x && current[id]?.y === p.y) continue
    if (!known && Object.keys(current).length >= LAYER_LIMITS.positions) continue
    positions = { ...current, [id]: { x: p.x, y: p.y } }
  }
  return positions ? { ...layer, positions } : layer
}

/** Stores the size the user gave a card. */
export function resizeCard(layer: Layer, id: string, size: Size): Layer {
  if (!inRange(size.width, LAYER_LIMITS.extent, 0) || !inRange(size.height, LAYER_LIMITS.extent, 0)) return layer
  const known = Object.hasOwn(layer.sizes, id)
  const current = known ? layer.sizes[id] : undefined
  if (current && current.width === size.width && current.height === size.height) return layer
  if (!known && Object.keys(layer.sizes).length >= LAYER_LIMITS.sizes) return layer
  return { ...layer, sizes: { ...layer.sizes, [id]: { width: size.width, height: size.height } } }
}

// Marks

/** Drops points that lie within `tolerance` of the line through their neighbors (Ramer-Douglas-Peucker), rounded to 0.1. */
export function simplifyStroke(points: readonly Point[], tolerance = 0.75): Point[] {
  const round = (p: Point): Point => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })
  if (points.length <= 2) return points.map(round)
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number]
    const a = points[first] as Point
    const b = points[last] as Point
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    let far = -1
    let farthest = tolerance
    for (let i = first + 1; i < last; i++) {
      const p = points[i] as Point
      const d = length === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / length
      if (d > farthest) {
        farthest = d
        far = i
      }
    }
    if (far >= 0) {
      keep[far] = 1
      stack.push([first, far], [far, last])
    }
  }
  return points.filter((_, i) => keep[i] === 1).map(round)
}

/** Adds a mark. A stroke is simplified first. Unchanged when the mark is not valid or the limit is reached. */
export function addMark(layer: Layer, input: Mark): Layer {
  if (layer.marks.length >= LAYER_LIMITS.marks) return layer
  const candidate = input.kind === 'stroke' ? { ...input, points: simplifyStroke(input.points).slice(0, LAYER_LIMITS.strokePoints) } : input
  const parsed = markSchema.safeParse(candidate)
  return parsed.success ? { ...layer, marks: [...layer.marks, parsed.data] } : layer
}

/** Replaces a mark with a changed copy, such as one moved or given a note. The ID and kind stay. */
export function updateMark(layer: Layer, id: string, change: (mark: Mark) => Mark): Layer {
  return mapItem(layer, 'mark', id, (m) => {
    const next = change(m)
    if (next === m || next.id !== m.id || next.kind !== m.kind) return m
    const parsed = markSchema.safeParse(next)
    return parsed.success ? parsed.data : m
  })
}

export const deleteMark = (layer: Layer, id: string): Layer => removeItem(layer, 'mark', id)

// Proposals

export function addProposal(layer: Layer, input: Proposal): Layer {
  if (layer.proposals.length >= LAYER_LIMITS.proposals) return layer
  const parsed = proposalSchema.safeParse(input)
  return parsed.success ? { ...layer, proposals: [...layer.proposals, parsed.data] } : layer
}

/** Moves proposed parts, as one change. Unknown IDs and points out of range are ignored. */
export function moveProposals(layer: Layer, moves: Readonly<Record<string, Point>>): Layer {
  let moved = false
  const proposals = layer.proposals.map((p) => {
    const to = Object.hasOwn(moves, p.id) ? moves[p.id] : undefined
    if (!to || (to.x === p.x && to.y === p.y) || !inRange(to.x, LAYER_LIMITS.coordinate) || !inRange(to.y, LAYER_LIMITS.coordinate)) return p
    moved = true
    return { ...p, x: to.x, y: to.y }
  })
  return moved ? { ...layer, proposals } : layer
}

export function updateProposal(layer: Layer, id: string, change: Partial<Omit<Proposal, 'id' | 'createdAt'>>): Layer {
  return mapItem(layer, 'proposal', id, (p) => {
    const parsed = proposalSchema.safeParse({ ...p, ...change })
    return parsed.success && JSON.stringify(parsed.data) !== JSON.stringify(p) ? parsed.data : p
  })
}

/**
 * Removes a proposed part with everything that hangs on it: its links and the connection ends moved onto it.
 * Arrows that pointed at it keep pointing at the spot where it was.
 */
export function deleteProposal(layer: Layer, id: string): Layer {
  const part = layer.proposals.find((p) => p.id === id)
  if (!part) return layer
  const spot = { type: 'point' as const, x: part.x + part.width / 2, y: part.y + part.height / 2 }
  const reconnects: Reconnect[] = []
  for (const r of layer.reconnects) {
    const from = r.from === id ? undefined : r.from
    const to = r.to === id ? undefined : r.to
    if (from === undefined && to === undefined) continue
    reconnects.push({ id: r.id, relationshipId: r.relationshipId, createdAt: r.createdAt, ...(from ? { from } : {}), ...(to ? { to } : {}) })
  }
  const unpin = (end: Extract<Mark, { kind: 'arrow' }>['from']) => (end.type === 'part' && end.id === id ? spot : end)
  return {
    ...layer,
    proposals: layer.proposals.filter((p) => p.id !== id),
    links: layer.links.filter((l) => l.from !== id && l.to !== id),
    reconnects,
    marks: layer.marks.map((m) => (m.kind === 'arrow' && (m.from !== unpin(m.from) || m.to !== unpin(m.to)) ? { ...m, from: unpin(m.from), to: unpin(m.to) } : m)),
  }
}

// Reconnects

/**
 * Moves an end of one of the agent's connections. An end dropped back on its original part is no longer an edit,
 * and a connection with no edited end has no reconnect at all.
 */
export function reconnect(layer: Layer, board: Board, input: { relationshipId: string; end: 'from' | 'to'; part: string }, now: Date, id: string): EditResult {
  const relationship = board.relationships.find((r) => r.id === input.relationshipId)
  if (!relationship) return { ok: false, layer, error: `There is no connection "${input.relationshipId}".` }
  if (!partIds(board, layer).has(input.part)) return { ok: false, layer, error: `There is no part "${input.part}".` }
  const existing = layer.reconnects.find((r) => r.relationshipId === relationship.id)
  const ends = { from: existing?.from, to: existing?.to, [input.end]: input.part === relationship[input.end] ? undefined : input.part }
  const from = ends.from ?? relationship.from
  const to = ends.to ?? relationship.to
  if (from === to) return { ok: false, layer, error: 'A connection needs two different parts.' }
  const others = layer.reconnects.filter((r) => r !== existing)
  if (ends.from === undefined && ends.to === undefined) return { ok: true, layer: existing ? { ...layer, reconnects: others } : layer }
  if (existing && existing.from === ends.from && existing.to === ends.to) return { ok: true, layer }
  if (!existing && layer.reconnects.length >= LAYER_LIMITS.reconnects) return { ok: false, layer, error: 'There are too many changed connections.' }
  const next: Reconnect = {
    id: existing?.id ?? id,
    relationshipId: relationship.id,
    createdAt: existing?.createdAt ?? now.toISOString(),
    ...(ends.from === undefined ? {} : { from: ends.from }),
    ...(ends.to === undefined ? {} : { to: ends.to }),
  }
  const at = existing ? layer.reconnects.indexOf(existing) : layer.reconnects.length
  return { ok: true, layer: { ...layer, reconnects: [...others.slice(0, at), next, ...others.slice(at)] } }
}

export const deleteReconnect = (layer: Layer, id: string): Layer => removeItem(layer, 'reconnect', id)

// The agent's answers

const sameResponse = (a: Response, b: Response) => JSON.stringify(a) === JSON.stringify(b)

/**
 * True when the agent adopted an item and the board shows it: the answer names what changed, and every ID it names is
 * on this revision. An adopted answer that names nothing, or names something missing, stays next to the item instead.
 */
export function adoptionLanded(board: Board, response: Response): boolean {
  if (response.status !== 'adopted' || response.changed.length === 0) return false
  const ids = new Set([...board.components.map((c) => c.id), ...board.relationships.map((r) => r.id)])
  return response.changed.every((id) => ids.has(id))
}

/** The user keeps their item with its answer: both stay on the map, and the answer stops waiting for a decision. */
export function keepAnswer(layer: Layer, id: string): Layer {
  if (!layer.answers.some((a) => a.id === id) || layer.kept.includes(id)) return layer
  return { ...layer, kept: [...layer.kept, id] }
}

/**
 * Takes in the answers of a revision. Each answer is kept next to its item, and an adopted item that landed on the board
 * moves to the archive. An answer already taken in is skipped, so an item the user restored stays restored when the same
 * revision opens again. Answers to items the user no longer has are dropped, and so is the mark of a kept answer whose
 * item or answer is gone. A new answer to a kept item waits again. Nothing is ever deleted.
 */
export function receiveAnswers(layer: Layer, board: Board, now: Date): Layer {
  const live = new Set(itemsOfLayer(layer).map((x) => x.id))
  let answers = layer.answers.filter((a) => live.has(a.id))
  let held = layer.kept.filter((id) => live.has(id))
  const toArchive: { id: string; response: Response }[] = []
  for (const r of board.responses?.items ?? []) {
    if (!live.has(r.feedbackId)) continue
    const response: Response = { respondsTo: board.responses?.respondsTo ?? '', status: r.status, text: r.text, changed: r.changed }
    const known = answers.find((a) => a.id === r.feedbackId)
    if (known && sameResponse(known.response, response)) continue
    // The new answer asks for its own decision, so the old one's mark goes.
    held = held.filter((k) => k !== r.feedbackId)
    if (adoptionLanded(board, response)) {
      toArchive.push({ id: r.feedbackId, response })
      continue
    }
    answers = [...answers.filter((a) => a.id !== r.feedbackId), { id: r.feedbackId, response }]
  }
  const sameKept = held.length === layer.kept.length && held.every((k, i) => k === layer.kept[i])
  const heldLayer = answers.length === layer.answers.length && answers.every((a, i) => a === layer.answers[i]) && sameKept
    ? layer
    : { ...layer, answers: answers.slice(-LAYER_LIMITS.answers), ...(sameKept ? {} : { kept: held }) }
  return toArchive.length === 0 ? heldLayer : archiveItems(heldLayer, toArchive, now)
}

function itemsOfLayer(layer: Layer): Entry[] {
  return (Object.keys(COLLECTION) as ItemType[]).flatMap((type) => list(layer, type) as readonly Entry[])
}

/** Moves the items the agent resolved, or the user dismissed, into the archive, each with its answer. Unknown IDs are skipped. */
export function archiveItems(layer: Layer, answers: readonly { id: string; response: Response }[], now: Date): Layer {
  let next = layer
  const added: ArchiveEntry[] = []
  for (const { id, response } of answers) {
    const found = findItem(next, id)
    if (!found || next.archive.length + added.length >= LAYER_LIMITS.archive) continue
    const entry = archiveEntry.safeParse({ ...found, response, archivedAt: now.toISOString() })
    if (!entry.success) continue
    added.push(entry.data)
    next = removeItem(next, found.type, id)
  }
  return added.length === 0 ? layer : { ...next, archive: [...next.archive, ...added] }
}

/** Puts an archived item back on the map, with the answer it had, so the same answer does not archive it again. It waits for a decision again. */
export function restoreArchived(layer: Layer, id: string): Layer {
  const entry = layer.archive.find((e) => e.item.id === id)
  if (!entry || findItem(layer, id)) return layer
  const back = withList(layer, entry.type, [...(list(layer, entry.type) as readonly Entry[]), entry.item])
  return {
    ...back,
    archive: layer.archive.filter((e) => e !== entry),
    answers: [...layer.answers.filter((a) => a.id !== id), { id, response: entry.response }].slice(-LAYER_LIMITS.answers),
    kept: layer.kept.filter((k) => k !== id),
  }
}

/** Forgets an archived item for good. */
export function dropArchived(layer: Layer, id: string): Layer {
  return layer.archive.some((e) => e.item.id === id) ? { ...layer, archive: layer.archive.filter((e) => e.item.id !== id) } : layer
}

export function recordSent(layer: Layer, sent: Sent): Layer {
  return { ...layer, sent }
}
