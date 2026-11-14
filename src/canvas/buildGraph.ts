import { MarkerType, Position, type Edge, type EdgeMarker, type Node } from '@xyflow/react'
import type { Board, BoardRelationship, SourceKind } from '../board/schema'
import { KIND_WORDS } from '../app/labels'
import type { Selection } from '../app/state'
import { groupAreas, GROUP_PADDING, summaryLinesFor } from '../layout/cards'
import { inflate, overlaps, type Point, type Rect } from '../layout/geometry'
import type { Link, Mark, Proposal, Reconnect } from '../layer/model'
import { pillHeight, placeLabel, PointIndex, textArea } from './labelPlacement'
import { Drawn, lineHitsCards, Obstacles, planEdges, quickRoute, routeConnection, type EdgeEnds, type Route, type Side } from './routing'
import { KIND_STYLE, TONE_COLOR } from './kinds'

/** Edge IDs of the user's links start with this. A board ID cannot contain a colon, so they never clash. */
export const MANUAL_PREFIX = 'manual:'
/** The line of a connection whose ends the user moved, as the user wants it. Its original stays, dimmed, under its own ID. */
export const EDITED_PREFIX = 'edit:'
/** Node IDs of text and sticky notes on the map. */
export const MARK_PREFIX = 'mark:'

export { GROUP_PADDING }

/**
 * Every connection joins the same two hidden handles on its cards. The line is drawn from its own path, so it never
 * depends on which side it leaves from. A handle that changed while a card moved made React Flow drop the edge for a frame.
 */
export const EDGE_OUT_HANDLE = 'edge-out'
export const EDGE_IN_HANDLE = 'edge-in'

export type { Side }
export const SIDE_POSITION: Record<Side, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
}

export interface CardData extends Record<string, unknown> {
  componentId: string
  /** A walkthrough step is about this part. */
  highlighted: boolean
  /** A walkthrough is playing and this part is not in the step. */
  dimmed: boolean
  /** How many of the user's notes and questions are attached to this part. */
  noteCount: number
  label: string
  summary: string
  sourceKind: SourceKind
  hasLesson: boolean
  /** How many summary lines fit on the card at its size. */
  summaryLines: number
}
export interface ManualEdgeData extends Record<string, unknown> {
  linkId: string
  /** The words on the pill: the link's label, or "Your link". */
  text: string
  hasLabel: boolean
  active: boolean
  /** A part is selected and this link is not one of its own. */
  faded: boolean
  path: string
  labelX: number
  labelY: number
  labelWidth: number
  labelLines: number
  /** The line is a cheap elbow while a card moves, so the label has no place yet and stays hidden. */
  moving: boolean
  /** How many group areas lie under the label, so its cutout can match their tint. */
  depth: number
}
export interface GroupData extends Record<string, unknown> {
  label: string
}
export interface EdgeData extends Record<string, unknown> {
  relationshipId: string
  label: string
  kind: BoardRelationship['kind']
  active: boolean
  highlighted: boolean
  dimmed: boolean
  /** A part is selected and this connection is not one of its own. */
  faded: boolean
  /** The drawn line. It leaves each card from a side and keeps out of the other cards. */
  path: string
  /** Where the label sits and how wide it is. Chosen to stay off card text and off other labels. */
  labelX: number
  labelY: number
  labelWidth: number
  labelLines: number
  /** The line is a cheap elbow while a card moves, so the label has no place yet and stays hidden. */
  moving: boolean
  /** How many group areas lie under the label, so its cutout can match their tint. */
  depth: number
  /** The user moved an end: the line is drawn where the user wants it, and `ghost` is the original, dimmed. */
  edited: boolean
  ghost?: string
}

export interface ProposalData extends Record<string, unknown> {
  proposalId: string
  label: string
  summary: string
  summaryLines: number
  noteCount: number
}

export interface MarkNodeData extends Record<string, unknown> {
  mark: Extract<Mark, { kind: 'text' | 'sticky' }>
}

/** What the user added that the map draws as nodes and lines: proposed parts, moved connection ends, text, and sticky notes. */
export interface UserParts {
  proposals: readonly Proposal[]
  reconnects: readonly Reconnect[]
  marks: readonly Mark[]
  /** A text or sticky note in motion, drawn at this spot and size until it is dropped. */
  moving?: { id: string; x: number; y: number; width?: number; height?: number } | undefined
  /** The mark or proposed part being typed in place. Its node hides under the editor. */
  editing?: string | undefined
}

/** Text and sticky notes sit above the ink layer, which sits above the cards and the connection labels. */
export const MARK_NODE_Z = 1160

const NO_USER_PARTS: UserParts = { proposals: [], reconnects: [], marks: [] }

export interface GroupBox {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

function groupBounds(board: Board, rects: Readonly<Record<string, Rect>>): GroupBox[] {
  const areas = groupAreas(board, rects)
  return board.groups.flatMap((g) => {
    const area = areas[g.id]
    return area ? [{ id: g.id, label: g.label, ...area }] : []
  })
}

/** Where one connection is drawn and where its label sits. Identical shapes keep the same object. */
export interface EdgeShape {
  id: string
  from: string
  to: string
  /** The drawn line. It leaves each card from a side and keeps out of the other cards. */
  path: string
  /** Where the label sits and how wide it is. Chosen to stay off card text and off other labels. */
  labelX: number
  labelY: number
  labelWidth: number
  labelLines: number
  /** The sampled points of the drawn line, kept so a later build can check that the line still keeps clear of the cards. */
  points: readonly Point[]
  runs?: readonly (readonly [Point, Point])[]
  /** Drawn as a plain elbow with the label at the middle while a card moves. Never kept by a later build. */
  cheap?: true
}

/** Everything the map draws that depends on where the cards are. The slow part of a build. */
export interface Geometry {
  edges: ReadonlyMap<string, EdgeShape>
  groups: readonly GroupBox[]
  /** Both ends of every drawn connection, in drawing order. */
  ends: readonly EdgeEnds[]
  /** Where the cards were when the lines were last fully solved. A card that has since moved or changed size is the one that changes the picture. */
  solved: Readonly<Record<string, Rect>>
}

/** A pill box, as it is drawn. */
function pillBox(shape: Pick<EdgeShape, 'labelX' | 'labelY' | 'labelWidth' | 'labelLines'>): Rect {
  const height = pillHeight(shape.labelLines)
  return { x: shape.labelX - shape.labelWidth / 2, y: shape.labelY - height / 2, width: shape.labelWidth, height }
}

const manualId = (id: string) => `${MANUAL_PREFIX}${id}`
export const editedId = (id: string) => `${EDITED_PREFIX}${id}`

/**
 * Routes every line, then places every label so it keeps off all of them.
 *
 * Pass the `previous` geometry of the same board and links to keep the picture steady: a connection whose two cards
 * did not move keeps its line, and its label keeps its place, as long as they are still clear of the moved cards and
 * every other label. Only the connections of moved cards, and those that a moved card now covers, are solved again.
 */
export function computeGeometry(
  board: Board,
  rects: Readonly<Record<string, Rect>>,
  links: readonly Link[] = [],
  previous?: Geometry,
  reconnects: readonly Reconnect[] = [],
): Geometry {
  // The board's parts and the user's proposed parts. Both are cards the lines keep out of.
  const boxOf = new Map<string, Rect>(Object.entries(rects))
  const boxes = [...boxOf.values()]
  const groups = groupBounds(board, rects)
  const groupRect = new Map<string, Rect>(groups.map((g) => [g.id, g]))
  const groupOfCard = new Map<string, string | undefined>(board.components.map((c) => [c.id, c.group]))
  const ownGroups = (end: EdgeEnds): Rect[] => {
    const out: Rect[] = []
    for (const card of [end.from, end.to]) {
      const g = groupOfCard.get(card)
      const r = g === undefined ? undefined : groupRect.get(g)
      if (r) out.push(r)
    }
    return out
  }
  const obstacles = new Obstacles(boxes, groups)
  const drawn = links.filter((l) => boxOf.has(l.from) && boxOf.has(l.to))
  const editOf = new Map(reconnects.map((e) => [e.relationshipId, e]))
  const ends: EdgeEnds[] = []
  const texts = new Map<string, string>()
  for (const r of board.relationships) {
    ends.push(r)
    const text = r.kind === 'unknown' ? `? ${r.label}` : r.label
    const edit = editOf.get(r.id)
    const from = edit?.from ?? r.from
    const to = edit?.to ?? r.to
    if (edit && from !== to && boxOf.has(from) && boxOf.has(to)) {
      // The label moves with the line the user drew. The original keeps its line only.
      ends.push({ id: editedId(r.id), from, to })
      texts.set(editedId(r.id), text)
      texts.set(r.id, '')
    } else texts.set(r.id, text)
  }
  for (const l of drawn) ends.push({ id: manualId(l.id), from: l.from, to: l.to })
  const plans = planEdges(rects, ends)
  // The chip adds a few characters, so the width is measured with them.
  for (const l of drawn) texts.set(manualId(l.id), l.label === '' ? 'Your link' : `You ${l.label}`)

  // The cards that moved since the lines were last solved.
  const movedBoxes: Rect[] = []
  const movedIds = new Set<string>()
  if (previous) {
    for (const [id, box] of boxOf) {
      const was = previous.solved[id]
      if (!was || was.x !== box.x || was.y !== box.y || was.width !== box.width || was.height !== box.height) {
        movedIds.add(id)
        movedBoxes.push(box)
      }
    }
  }
  const kept = (end: EdgeEnds): EdgeShape | undefined => {
    const shape = previous?.edges.get(end.id)
    if (!shape || shape.cheap || shape.from !== end.from || shape.to !== end.to) return undefined
    if (movedIds.has(end.from) || movedIds.has(end.to)) return undefined
    return lineHitsCards(shape.points, movedBoxes) ? undefined : shape
  }

  // Draw every line first, so each label can keep off all of them. Lines that stay come first, so the rest route
  // around them. The rest go shortest first, then by ID, so a line keeps its track from one build to the next.
  const runs = new Drawn()
  const slots: ({ id: string; from: string; to: string; text: string; route: Route; stays: EdgeShape | undefined } | undefined)[] = ends.map(() => undefined)
  const fresh: number[] = []
  ends.forEach((end, i) => {
    const stays = kept(end)
    if (!stays) {
      fresh.push(i)
      return
    }
    const route: Route = { d: stays.path, points: stays.points as Point[], ...(stays.runs ? { runs: stays.runs as [Point, Point][] } : {}) }
    slots[i] = { id: end.id, from: end.from, to: end.to, text: texts.get(end.id) ?? '', route, stays }
    if (route.runs) runs.add(route.runs)
  })
  const reach = (i: number) => {
    const plan = plans.get((ends[i] as EdgeEnds).id)
    return plan ? Math.abs(plan.a.x - plan.b.x) + Math.abs(plan.a.y - plan.b.y) : Infinity
  }
  const lengths = new Map(fresh.map((i) => [i, reach(i)]))
  fresh.sort((i, j) => (lengths.get(i) as number) - (lengths.get(j) as number) || ((ends[i] as EdgeEnds).id < (ends[j] as EdgeEnds).id ? -1 : 1))
  for (const i of fresh) {
    const end = ends[i] as EdgeEnds
    const plan = plans.get(end.id)
    if (!plan || !boxOf.has(end.from) || !boxOf.has(end.to)) continue
    const route = routeConnection(plan, boxes, runs, obstacles, ownGroups(end))
    slots[i] = { id: end.id, from: end.from, to: end.to, text: texts.get(end.id) ?? '', route, stays: undefined }
    if (route.runs) runs.add(route.runs)
  }
  const routes = slots.filter((r) => r !== undefined)

  const lines = new PointIndex()
  routes.forEach((r, i) => lines.add(i, r.route.points))
  const movedAreas = movedBoxes.map(textArea)
  const taken: Rect[] = []
  const edges = new Map<string, EdgeShape>()
  const shapeOf = (r: (typeof routes)[number], label: { x: number; y: number; width: number; lines: number }): EdgeShape => ({
    id: r.id,
    from: r.from,
    to: r.to,
    path: r.route.d,
    labelX: label.x,
    labelY: label.y,
    labelWidth: label.width,
    labelLines: label.lines,
    points: r.route.points,
    ...(r.route.runs ? { runs: r.route.runs } : {}),
  })
  const place = (r: (typeof routes)[number], i: number) => {
    if (r.text === '') {
      const middle = r.route.points[Math.floor(r.route.points.length / 2)] ?? { x: 0, y: 0 }
      edges.set(r.id, shapeOf(r, { ...middle, width: 0, lines: 0 }))
      return
    }
    const label = placeLabel(r.route.points, r.text, boxes, taken, lines, i)
    taken.push(pillBox({ labelX: label.x, labelY: label.y, labelWidth: label.width, labelLines: label.lines }))
    edges.set(r.id, shapeOf(r, label))
  }
  // A label stays where it was while no moved card's text and no label placed before it is under it.
  const later: number[] = []
  routes.forEach((r, i) => {
    const old = r.stays
    if (old && r.text === '') {
      edges.set(r.id, old)
      return
    }
    if (old && old.labelWidth > 0) {
      const box = pillBox(old)
      const clear = !movedAreas.some((a) => overlaps(box, a)) && !taken.some((t) => overlaps(box, inflate(t, 3)))
      if (clear) {
        taken.push(box)
        edges.set(r.id, old)
        return
      }
    }
    later.push(i)
  })
  for (const i of later) place(routes[i] as (typeof routes)[number], i)
  return { edges, groups, ends, solved: rects }
}

/**
 * The cheap update while a card moves. Only the connections of that card are redrawn, as plain elbows with the
 * label at the middle, and only the group area around it. Every other shape keeps its object.
 */
export function moveCard(board: Board, geometry: Geometry, rects: Readonly<Record<string, Rect>>, id: string): Geometry {
  const plans = planEdges(rects, geometry.ends)
  let edges: Map<string, EdgeShape> | undefined
  for (const [edgeId, shape] of geometry.edges) {
    if (shape.from !== id && shape.to !== id) continue
    const plan = plans.get(edgeId)
    if (!plan) continue
    const line = quickRoute(plan)
    const middle = line.points[Math.floor(line.points.length / 2)] ?? plan.a
    const next: EdgeShape = {
      ...shape,
      path: line.d,
      labelX: middle.x,
      labelY: middle.y,
      points: line.points,
      cheap: true,
    }
    edges ??= new Map(geometry.edges)
    edges.set(edgeId, next)
  }
  const group = board.components.find((c) => c.id === id)?.group
  let groups = geometry.groups
  if (group !== undefined) {
    const members = board.components.filter((c) => c.group === group)
    const area = groupAreas({ ...board, groups: board.groups.filter((g) => g.id === group), components: members }, rects)[group]
    if (area) groups = geometry.groups.map((g) => (g.id === group ? { ...g, ...area } : g))
  }
  return { edges: edges ?? geometry.edges, groups, ends: geometry.ends, solved: geometry.solved }
}

/** Reuses the previous object when nothing in it changed, so React and React Flow skip the work. */
export class GraphCache {
  readonly nodes = new Map<string, Node>()
  readonly edges = new Map<string, Edge>()
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  const keys = Object.keys(x)
  return keys.length === Object.keys(y).length && keys.every((k) => x[k] === y[k])
}

function stable<T extends Node | Edge>(cache: Map<string, T>, next: T): T {
  const prev = cache.get(next.id)
  if (prev) {
    const a = prev as unknown as Record<string, unknown>
    const b = next as unknown as Record<string, unknown>
    const keys = Object.keys(b)
    if (keys.length === Object.keys(a).length && keys.every((k) => sameValue(a[k], b[k]))) return prev
  }
  cache.set(next.id, next)
  return next
}

const markers = new Map<string, EdgeMarker>()
function markerFor(color: string): EdgeMarker {
  let marker = markers.get(color)
  if (!marker) {
    marker = { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }
    markers.set(color, marker)
  }
  return marker
}

/** How many group areas hold a point, at most two. */
function depthAt(groups: readonly GroupBox[], x: number, y: number): number {
  let depth = 0
  for (const g of groups) if (x >= g.x && x <= g.x + g.width && y >= g.y && y <= g.y + g.height) depth++
  return Math.min(depth, 2)
}

/** Turns the geometry and the current selection into React Flow nodes and edges. Cheap, so it runs on every change. */
export function assembleGraph(
  board: Board,
  rects: Readonly<Record<string, Rect>>,
  geometry: Geometry,
  selection: Selection | undefined,
  highlight: ReadonlySet<string> | undefined,
  links: readonly Link[],
  noteCounts: ReadonlyMap<string, number>,
  cache: GraphCache,
  /** The card being dragged. It is never dimmed. */
  held?: string,
  /** Cards a drop just pushed aside. They glide to their new place. */
  pushed?: ReadonlySet<string>,
  user: UserParts = NO_USER_PARTS,
): { nodes: Node[]; edges: Edge[] } {
  const playing = highlight !== undefined && highlight.size > 0
  const names = new Map([...board.components.map((c) => [c.id, c.label] as const), ...user.proposals.map((p) => [p.id, p.label] as const)])
  const editOf = new Map(user.reconnects.map((e) => [e.relationshipId, e]))
  const selectedPart = selection?.type === 'component' ? selection.id : undefined
  // Picking a part leaves its own lines strong and softens the rest. Not while a card is held, and not during a walkthrough.
  const softening = selectedPart !== undefined && !playing && held === undefined

  const groups = geometry.groups.map((g) =>
    stable(cache.nodes, {
      id: `group:${g.id}`,
      type: 'group-area',
      position: { x: g.x, y: g.y },
      width: g.width,
      height: g.height,
      data: { label: g.label },
      selectable: false,
      draggable: false,
      focusable: false,
      connectable: false,
      deletable: false,
      zIndex: -1,
    } satisfies Node<GroupData>),
  )

  const cards = board.components.map((c) => {
    const rect = rects[c.id] ?? { x: 0, y: 0, width: 0, height: 0 }
    return stable(cache.nodes, {
      id: c.id,
      type: 'card',
      position: { x: rect.x, y: rect.y },
      width: rect.width,
      height: rect.height,
      // The map never applies measured sizes back to its nodes. Without this React Flow forgets the card's handles each
      // time the card object changes, and every line of a held card is gone until the next measurement.
      measured: { width: rect.width, height: rect.height },
      data: {
        componentId: c.id,
        highlighted: playing && highlight.has(c.id),
        dimmed: playing && !highlight.has(c.id) && c.id !== selectedPart && c.id !== held,
        noteCount: noteCounts.get(c.id) ?? 0,
        label: c.label,
        summary: c.summary,
        sourceKind: c.source.kind,
        hasLesson: c.lesson !== undefined,
        summaryLines: summaryLinesFor(c, rect),
      },
      selected: c.id === selectedPart,
      ...(c.id === held ? { className: 'held' } : pushed?.has(c.id) ? { className: 'pushed' } : {}),
      connectable: true,
      deletable: false,
      ariaLabel: `${c.label}. ${c.summary}`,
    } satisfies Node<CardData>)
  })

  const selectedProposal = selection?.type === 'proposal' ? selection.id : undefined
  const proposals = user.proposals.flatMap((p) => {
    const rect = rects[p.id]
    if (!rect) return []
    return [
      stable(cache.nodes, {
        id: p.id,
        type: 'proposal',
        position: { x: rect.x, y: rect.y },
        width: rect.width,
        height: rect.height,
        measured: { width: rect.width, height: rect.height },
        data: { proposalId: p.id, label: p.label, summary: p.summary, summaryLines: summaryLinesFor({ label: p.label }, rect), noteCount: noteCounts.get(p.id) ?? 0 },
        selected: p.id === selectedProposal,
        ...(p.id === user.editing ? { className: 'editing' } : p.id === held ? { className: 'held' } : pushed?.has(p.id) ? { className: 'pushed' } : {}),
        connectable: true,
        deletable: false,
        ariaLabel: `New part: ${p.label}${p.summary ? `. ${p.summary}` : ''}`,
      } satisfies Node<ProposalData>),
    ]
  })

  const selectedMark = selection?.type === 'mark' ? selection.id : undefined
  const notes = user.marks.flatMap((m) => {
    if (m.kind !== 'text' && m.kind !== 'sticky') return []
    const at = user.moving?.id === m.id ? { ...m, ...user.moving } : m
    return [
      stable(cache.nodes, {
        id: `${MARK_PREFIX}${m.id}`,
        type: m.kind === 'text' ? 'mark-text' : 'mark-sticky',
        position: { x: at.x, y: at.y },
        width: at.width,
        height: at.height,
        measured: { width: at.width, height: at.height },
        data: { mark: m },
        selected: m.id === selectedMark,
        ...(m.id === user.editing ? { className: 'editing' } : {}),
        connectable: false,
        deletable: false,
        zIndex: MARK_NODE_Z,
        ariaLabel: `${m.kind === 'text' ? 'Text' : 'Sticky note'}: ${m.text || 'empty'}`,
      } satisfies Node<MarkNodeData>),
    ]
  })

  const edges: Edge[] = []
  for (const r of board.relationships) {
    const original = geometry.edges.get(r.id)
    const edit = editOf.get(r.id)
    const moved = edit ? geometry.edges.get(editedId(r.id)) : undefined
    const shape = moved ?? original
    if (!shape || !original) continue
    const from = moved ? (edit?.from ?? r.from) : r.from
    const to = moved ? (edit?.to ?? r.to) : r.to
    const selected = selection?.type === 'relationship' && selection.id === r.id
    const active = selected || (selectedPart !== undefined && (from === selectedPart || to === selectedPart))
    const highlighted = playing && highlight.has(r.id)
    const color = active || highlighted ? 'var(--accent)' : moved ? 'var(--yours)' : TONE_COLOR[KIND_STYLE[r.kind].tone]
    edges.push(
      stable(cache.edges, {
        id: r.id,
        type: 'relationship',
        source: from,
        target: to,
        sourceHandle: EDGE_OUT_HANDLE,
        targetHandle: EDGE_IN_HANDLE,
        selected,
        focusable: true,
        deletable: false,
        interactionWidth: 28,
        markerEnd: markerFor(color),
        ariaLabel: `${names.get(from) ?? from} ${r.kind === 'unknown' ? 'connects to' : KIND_WORDS[r.kind]} ${names.get(to) ?? to}: ${r.label}${moved ? '. You moved its end.' : ''}`,
        data: {
          relationshipId: r.id,
          label: r.label,
          kind: r.kind,
          active,
          highlighted,
          dimmed: playing && !highlighted,
          faded: softening && !active,
          path: shape.path,
          labelX: shape.labelX,
          labelY: shape.labelY,
          labelWidth: shape.labelWidth,
          labelLines: shape.labelLines,
          moving: shape.cheap === true,
          depth: depthAt(geometry.groups, shape.labelX, shape.labelY),
          edited: moved !== undefined,
          ...(moved ? { ghost: original.path } : {}),
        },
      } satisfies Edge<EdgeData>),
    )
  }
  for (const l of links) {
    const shape = geometry.edges.get(manualId(l.id))
    if (!shape) continue
    const selected = selection?.type === 'link' && selection.id === l.id
    const active = selected || (selectedPart !== undefined && (l.from === selectedPart || l.to === selectedPart))
    edges.push(
      stable(cache.edges, {
        id: manualId(l.id),
        type: 'manual-link',
        source: l.from,
        target: l.to,
        sourceHandle: EDGE_OUT_HANDLE,
        targetHandle: EDGE_IN_HANDLE,
        selected,
        focusable: true,
        deletable: false,
        interactionWidth: 28,
        markerEnd: markerFor(active ? 'var(--accent)' : 'var(--yours)'),
        ariaLabel: `Your link from ${names.get(l.from) ?? l.from} to ${names.get(l.to) ?? l.to}${l.label === '' ? '' : `: ${l.label}`}`,
        data: {
          linkId: l.id,
          text: l.label === '' ? 'Your link' : l.label,
          hasLabel: l.label !== '',
          active,
          faded: softening && !active,
          path: shape.path,
          labelX: shape.labelX,
          labelY: shape.labelY,
          labelWidth: shape.labelWidth,
          labelLines: shape.labelLines,
          moving: shape.cheap === true,
          depth: depthAt(geometry.groups, shape.labelX, shape.labelY),
        },
      } satisfies Edge<ManualEdgeData>),
    )
  }

  const nodes = [...groups, ...cards, ...proposals, ...notes]
  forget(cache.nodes, nodes)
  forget(cache.edges, edges)
  return { nodes, edges }
}

function forget<T extends { id: string }>(cache: Map<string, T>, live: readonly T[]): void {
  if (cache.size === live.length) return
  const ids = new Set(live.map((x) => x.id))
  for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id)
}

export function buildGraph(
  board: Board,
  rects: Readonly<Record<string, Rect>>,
  selection: Selection | undefined,
  /** IDs of the parts and connections a walkthrough step is about. Undefined or empty shows everything. */
  highlight?: ReadonlySet<string>,
  /** Links the user drew. A link whose end is missing is not drawn. */
  links: readonly Link[] = [],
  /** Notes and questions per part ID. */
  noteCounts: ReadonlyMap<string, number> = new Map(),
): { nodes: Node[]; edges: Edge[] } {
  const geometry = computeGeometry(board, rects, links)
  return assembleGraph(board, rects, geometry, selection, highlight, links, noteCounts, new GraphCache())
}
