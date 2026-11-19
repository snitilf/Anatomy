import { MarkerType, Position, type Edge, type EdgeMarker, type Node } from '@xyflow/react'
import type { Board, BoardRelationship, SourceKind } from '../board/schema'
import { KIND_WORDS } from '../app/labels'
import type { Selection } from '../app/state'
import { groupAreas, GROUP_PADDING, summaryLinesFor } from '../layout/cards'
import { overlaps, type Point, type Rect } from '../layout/geometry'
import type { Link, Mark, Proposal, Reconnect } from '../layer/model'
import { groupBand } from './bands'
import { clusterOf, connectionsOf, countPairs } from './bundles'
import { labelFits, pillHeight, placeLabel, RunIndex, textArea, type LabelContext } from './labelPlacement'
import { Drawn, lineHitsCards, Obstacles, planEdges, routeConnection, type EdgeEnds, type Route, type Side } from './routing'
import { TONE_COLOR } from './kinds'
import type { ItemState } from '../status/state'

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
  /** A part or a line is selected and this part is not touching it: it steps far back. */
  faded: boolean
  /** The size of the card on the board, which decides whether its tile carries a name in the far view, and on how many lines. */
  width: number
  height: number
  /** The map is in the far view: the card is a tile, which carries a name and a hover name. */
  far: boolean
  /** How many of the user's notes and questions are attached to this part. */
  noteCount: number
  /** Where those notes stand in the round trip: the state that wins among them. */
  noteState: ItemState
  /** How many of those notes are in that state. */
  noteStateCount: number
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
  /** No free place for the label: it shows in full when the line is hovered or selected. */
  labelHidden: boolean
  /** The line is hidden while a card moves. */
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
  /** No free place for the label: it shows in full when the line is hovered or selected. */
  labelHidden: boolean
  /** The line is hidden while a card moves. */
  moving: boolean
  /** How many group areas lie under the label, so its cutout can match their tint. */
  depth: number
  /** The user moved an end: the line is drawn where the user wants it, and `ghost` is the original, dimmed. */
  edited: boolean
  ghost?: string
}

export interface ProposalData extends Record<string, unknown> {
  proposalId: string
  width: number
  height: number
  far: boolean
  label: string
  summary: string
  summaryLines: number
  noteCount: number
  noteState: ItemState
  noteStateCount: number
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
  /** The label has no free place on the line: it shows when the line is hovered or selected. */
  labelHidden?: true
  /** No path kept the wanted spacing to the other lines: some run lies closer to another than `TRACK`. */
  crowded?: true
  /** Hidden while a card moves: the shape is stale until the full build. Never kept by a later build. */
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

/** How many times lines that found no room are routed again first. */
const RIP_UP_PASSES = 2

/**
 * The room a pill keeps from other labels. A label grows on screen at low zoom (up to this share, see `LABEL_MAX_SCALE`),
 * and placement does not know the zoom, so each label holds back the room it may grow into.
 */
export const LABEL_GROWTH = 1.3

function pillBox(shape: Pick<EdgeShape, 'labelX' | 'labelY' | 'labelWidth' | 'labelLines'>, room = 1): Rect {
  const height = pillHeight(shape.labelLines) * room
  const width = shape.labelWidth * room
  return { x: shape.labelX - width / 2, y: shape.labelY - height / 2, width, height }
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
  const steps = geometrySteps(board, rects, links, previous, reconnects)
  for (;;) {
    const step = steps.next()
    if (step.done) return step.value
  }
}

/**
 * The same solve as `computeGeometry`, in steps. It yields after each line is routed and after each label is placed,
 * so a caller can spread the work over several frames. Run to the end it returns exactly what `computeGeometry` returns.
 */
export function* geometrySteps(
  board: Board,
  rects: Readonly<Record<string, Rect>>,
  links: readonly Link[] = [],
  previous?: Geometry,
  reconnects: readonly Reconnect[] = [],
): Generator<void, Geometry, void> {
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
    // The question mark icon on an unknown connection is wider than the character, so the width is measured with two.
    const text = r.kind === 'unknown' ? `?? ${r.label}` : r.label
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
    // Another card's move can change where this line meets its cards, when they share a side with it.
    const plan = plans.get(end.id)
    const first = shape.points[0]
    const last = shape.points[shape.points.length - 1]
    if (!plan || !first || !last || first.x !== plan.a.x || first.y !== plan.a.y || last.x !== plan.b.x || last.y !== plan.b.y) return undefined
    if (lineHitsCards(shape.points, movedBoxes)) return undefined
    // A group that grew or moved may now have its name under the line.
    return shape.runs?.some(([p, q]) => obstacles.blocksBand(p, q)) ? undefined : shape
  }

  // Draw every line first, so each label can keep off all of them. Lines that stay come first, so the rest route
  // around them. The rest go shortest first, then by ID, so a line keeps its track from one build to the next.
  type Slot = { id: string; from: string; to: string; text: string; route: Route; stays: EdgeShape | undefined }
  const stayed: (Slot | undefined)[] = ends.map(() => undefined)
  const fresh: number[] = []
  ends.forEach((end, i) => {
    const stays = kept(end)
    if (!stays) {
      fresh.push(i)
      return
    }
    const route: Route = { d: stays.path, points: stays.points as Point[], ...(stays.runs ? { runs: stays.runs as [Point, Point][] } : {}), ...(stays.crowded ? { crowded: true as const } : {}) }
    stayed[i] = { id: end.id, from: end.from, to: end.to, text: texts.get(end.id) ?? '', route, stays }
  })
  const reach = (i: number) => {
    const plan = plans.get((ends[i] as EdgeEnds).id)
    return plan ? Math.abs(plan.a.x - plan.b.x) + Math.abs(plan.a.y - plan.b.y) : Infinity
  }
  const lengths = new Map(fresh.map((i) => [i, reach(i)]))
  fresh.sort((i, j) => (lengths.get(i) as number) - (lengths.get(j) as number) || ((ends[i] as EdgeEnds).id < (ends[j] as EdgeEnds).id ? -1 : 1))
  /** Routes the lines that are not kept, in this order, around the ones that stay and the ones drawn before. */
  const routeAll = function* (order: readonly number[]): Generator<void, (Slot | undefined)[], void> {
    const drawn = new Drawn()
    const placed = [...stayed]
    for (const r of stayed) if (r?.route.runs) drawn.add(r.route.runs)
    for (const i of order) {
      const end = ends[i] as EdgeEnds
      const plan = plans.get(end.id)
      if (!plan || !boxOf.has(end.from) || !boxOf.has(end.to)) continue
      const route = routeConnection(plan, boxes, drawn, obstacles, ownGroups(end))
      placed[i] = { id: end.id, from: end.from, to: end.to, text: texts.get(end.id) ?? '', route, stays: undefined }
      if (route.runs) drawn.add(route.runs)
      yield
    }
    return placed
  }
  let slots = yield* routeAll(fresh)
  // A line that found no room is routed again before the rest, which then work round it. This repeats while it helps.
  for (let pass = 0; pass < RIP_UP_PASSES; pass++) {
    const crowded = fresh.filter((i) => slots[i]?.route.crowded)
    if (crowded.length === 0) break
    const first = new Set(crowded)
    const again = yield* routeAll([...crowded, ...fresh.filter((i) => !first.has(i))])
    if (again.filter((r, i) => r?.route.crowded && fresh.includes(i)).length >= crowded.length) break
    slots = again
  }
  const routes = slots.filter((r) => r !== undefined)

  const lines = new RunIndex()
  routes.forEach((r, i) => lines.add(i, r.route.runs ?? []))
  const movedAreas = movedBoxes.map(textArea)
  const taken: Rect[] = []
  const edges = new Map<string, EdgeShape>()
  const context: LabelContext = { cards: boxes, bands: groups.map(groupBand), taken, lines, own: -1 }
  const shapeOf = (r: (typeof routes)[number], label: { x: number; y: number; width: number; lines: number; hidden?: true }): EdgeShape => ({
    id: r.id,
    from: r.from,
    to: r.to,
    path: r.route.d,
    labelX: label.x,
    labelY: label.y,
    labelWidth: label.width,
    labelLines: label.lines,
    ...(label.hidden ? { labelHidden: true as const } : {}),
    points: r.route.points,
    ...(r.route.runs ? { runs: r.route.runs } : {}),
    ...(r.route.crowded ? { crowded: true as const } : {}),
  })
  const place = (r: (typeof routes)[number], i: number) => {
    if (r.text === '') {
      const middle = r.route.points[Math.floor(r.route.points.length / 2)] ?? { x: 0, y: 0 }
      edges.set(r.id, shapeOf(r, { ...middle, width: 0, lines: 0 }))
      return
    }
    const label = placeLabel(r.route.runs ?? [], r.text, { ...context, own: i })
    if (!label.hidden) taken.push(pillBox({ labelX: label.x, labelY: label.y, labelWidth: label.width, labelLines: label.lines }, LABEL_GROWTH))
    edges.set(r.id, shapeOf(r, label))
  }
  // A label stays where it was while no moved card's text, no group name, no label placed before it, and no line is under it.
  const later: number[] = []
  // A label held back is tried again first, before the labels that stay take their places: room may have freed up.
  for (const [i, r] of routes.entries()) {
    const old = r.stays
    if (!old || !old.labelHidden || r.text === '') continue
    const label = placeLabel(r.route.runs ?? [], r.text, { ...context, own: i })
    yield
    if (label.hidden) {
      edges.set(r.id, old)
      continue
    }
    taken.push(pillBox({ labelX: label.x, labelY: label.y, labelWidth: label.width, labelLines: label.lines }, LABEL_GROWTH))
    edges.set(r.id, shapeOf(r, label))
  }
  for (const [i, r] of routes.entries()) {
    if (edges.has(r.id)) continue
    const old = r.stays
    if (old && r.text === '') {
      edges.set(r.id, old)
      continue
    }
    if (old && old.labelWidth > 0) {
      const box = pillBox(old)
      const clear = !movedAreas.some((a) => overlaps(box, a)) && labelFits(box, { ...context, own: i }, undefined)
      if (clear) {
        taken.push(pillBox(old, LABEL_GROWTH))
        edges.set(r.id, old)
        continue
      }
    }
    later.push(i)
  }
  for (const i of later) {
    place(routes[i] as (typeof routes)[number], i)
    yield
  }
  return { edges, groups, ends, solved: rects }
}

/**
 * The cheap update while a card moves. The connections of that card are marked as moving and drawn by nobody: the map
 * hides them until the full build after the drop, so no line is redrawn per frame. Only the group area around the
 * card follows it. Every other shape keeps its object.
 */
export function moveCard(board: Board, geometry: Geometry, rects: Readonly<Record<string, Rect>>, id: string): Geometry {
  let edges: Map<string, EdgeShape> | undefined
  for (const [edgeId, shape] of geometry.edges) {
    if ((shape.from !== id && shape.to !== id) || shape.cheap) continue
    edges ??= new Map(geometry.edges)
    edges.set(edgeId, { ...shape, cheap: true })
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
    marker = { type: MarkerType.ArrowClosed, color, width: 12, height: 12 }
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
  /** The far view: the lines are out of the picture, so they leave the tab order. They stay in the page. */
  far = false,
  /** The state of the notes on each part, for the badge. A part with notes and no entry shows as not sent. */
  noteStates: ReadonlyMap<string, { state: ItemState; count: number }> = new Map(),
): { nodes: Node[]; edges: Edge[] } {
  const playing = highlight !== undefined && highlight.size > 0
  const names = new Map([...board.components.map((c) => [c.id, c.label] as const), ...user.proposals.map((p) => [p.id, p.label] as const)])
  const editOf = new Map(user.reconnects.map((e) => [e.relationshipId, e]))
  const selectedPart = selection?.type === 'component' ? selection.id : undefined
  // Picking a part leaves its own lines strong and softens the rest. Not while a card is held, and not during a walkthrough.
  const selectedLine = selection?.type === 'relationship' || selection?.type === 'link' ? selection.id : undefined
  // A part or a line selected is a spotlight: what it touches stays, the rest steps far back.
  // A bundle selected keeps the parts of its two ends and its own connections.
  const bundle = selection?.type === 'bundle' ? selection : undefined
  const bundled = new Set<string>()
  const softening = (selectedPart !== undefined || selectedLine !== undefined || bundle !== undefined) && !playing && held === undefined
  const touching = new Set<string>()
  if (softening && bundle) {
    const clusters = clusterOf(board, user.proposals)
    const all = connectionsOf(board, links, user.reconnects)
    const pair = countPairs(clusters, all).find((p) => p.a === bundle.a && p.b === bundle.b)
    for (const id of pair?.connectionIds ?? []) bundled.add(id)
    // The parts the connections touch stay. The rest of the two groups steps back with everything else.
    for (const c of all) if (bundled.has(c.id)) touching.add(c.from).add(c.to)
  } else if (softening) {
    if (selectedPart !== undefined) {
      touching.add(selectedPart)
      for (const r of board.relationships) {
        const edit = editOf.get(r.id)
        const from = edit?.from ?? r.from
        const to = edit?.to ?? r.to
        if (from === selectedPart) touching.add(to)
        if (to === selectedPart) touching.add(from)
      }
      for (const l of links) {
        if (l.from === selectedPart) touching.add(l.to)
        if (l.to === selectedPart) touching.add(l.from)
      }
    } else if (selection?.type === 'relationship') {
      const r = board.relationships.find((x) => x.id === selection.id)
      const edit = r ? editOf.get(r.id) : undefined
      if (r) touching.add(edit?.from ?? r.from).add(edit?.to ?? r.to)
    } else if (selection?.type === 'link') {
      const l = links.find((x) => x.id === selection.id)
      if (l) touching.add(l.from).add(l.to)
    }
  }

  const movedGroups = new Set<string>()
  if (pushed && pushed.size > 0) {
    for (const g of geometry.groups) {
      const members = board.components.filter((c) => c.group === g.id)
      if (members.length > 0 && members.every((c) => pushed.has(c.id))) movedGroups.add(g.id)
    }
  }
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
      // An area that moved as a whole, with all its cards, glides with them.
      ...(movedGroups.has(g.id) ? { className: 'pushed' } : {}),
    } satisfies Node<GroupData>),
  )

  const groupLabel = new Map(board.groups.map((g) => [g.id, g.label]))
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
        faded: softening && !touching.has(c.id),
        width: rect.width,
        height: rect.height,
        far,
        noteCount: noteCounts.get(c.id) ?? 0,
        noteState: noteStates.get(c.id)?.state ?? 'unsent',
        noteStateCount: noteStates.get(c.id)?.count ?? noteCounts.get(c.id) ?? 0,
        label: c.label,
        summary: c.summary,
        sourceKind: c.source.kind,
        hasLesson: c.lesson !== undefined,
        summaryLines: summaryLinesFor(c, rect, noteCounts.get(c.id) ?? 0),
      },
      selected: c.id === selectedPart,
      ...(c.id === held ? { className: 'held' } : pushed?.has(c.id) ? { className: 'pushed' } : {}),
      connectable: true,
      deletable: false,
      // A part keeps its role when the map takes it out of the tab order, as the far view does.
      ariaRole: 'group',
      // The name is the part and its group. The summary is the description, so a screen reader does not read it as the name.
      ariaLabel: groupLabel.get(c.group ?? '') ? `${c.label}, in ${groupLabel.get(c.group ?? '')}` : c.label,
      domAttributes: { 'aria-description': c.summary } as NonNullable<Node['domAttributes']>,
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
        data: { proposalId: p.id, width: rect.width, height: rect.height, far, label: p.label, summary: p.summary, summaryLines: summaryLinesFor({ label: p.label }, rect, noteCounts.get(p.id) ?? 0), noteCount: noteCounts.get(p.id) ?? 0, noteState: noteStates.get(p.id)?.state ?? 'unsent', noteStateCount: noteStates.get(p.id)?.count ?? noteCounts.get(p.id) ?? 0 },
        selected: p.id === selectedProposal,
        ...(p.id === user.editing ? { className: 'editing' } : p.id === held ? { className: 'held' } : pushed?.has(p.id) ? { className: 'pushed' } : {}),
        connectable: true,
        deletable: false,
        ariaRole: 'group',
        ariaLabel: p.label,
        domAttributes: { 'aria-description': p.summary } as NonNullable<Node['domAttributes']>,
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
    const active = selected || bundled.has(r.id) || (selectedPart !== undefined && (from === selectedPart || to === selectedPart))
    const highlighted = playing && highlight.has(r.id)
    const color = active || highlighted ? 'var(--accent-line)' : moved ? 'var(--yours)' : TONE_COLOR.strong
    edges.push(
      stable(cache.edges, {
        id: r.id,
        type: 'relationship',
        source: from,
        target: to,
        sourceHandle: EDGE_OUT_HANDLE,
        targetHandle: EDGE_IN_HANDLE,
        selected,
        focusable: !far,
        deletable: false,
        hidden: shape.cheap === true,
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
          labelHidden: shape.labelHidden === true,
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
    const active = selected || bundled.has(l.id) || (selectedPart !== undefined && (l.from === selectedPart || l.to === selectedPart))
    edges.push(
      stable(cache.edges, {
        id: manualId(l.id),
        type: 'manual-link',
        source: l.from,
        target: l.to,
        sourceHandle: EDGE_OUT_HANDLE,
        targetHandle: EDGE_IN_HANDLE,
        selected,
        focusable: !far,
        deletable: false,
        hidden: shape.cheap === true,
        interactionWidth: 28,
        markerEnd: markerFor(active ? 'var(--accent-line)' : 'var(--yours)'),
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
          labelHidden: shape.labelHidden === true,
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
