import { MarkerType, Position, type Edge, type EdgeMarker, type Node } from '@xyflow/react'
import type { Board, BoardRelationship, SourceKind } from '../board/schema'
import { KIND_WORDS } from '../app/labels'
import type { Selection } from '../app/state'
import { CARD_HEIGHT, CARD_WIDTH } from '../overlay/layout'
import type { ManualLink, Point } from '../overlay/types'
import { pillHeight, placeLabel, PointIndex } from './labelPlacement'
import { curve, Obstacles, planEdges, routeConnection, type EdgeEnds, type Rect, type Route, type Side } from './routing'
import { KIND_STYLE, TONE_COLOR } from './kinds'

/** Edge IDs of the user's links start with this. A board ID cannot contain a colon, so they never clash. */
export const MANUAL_PREFIX = 'manual:'

export const GROUP_PADDING = { side: 24, top: 46, bottom: 24 }

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
}

export interface GroupBox {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

function groupBox(board: Board, g: Board['groups'][number], positions: Record<string, Point>): GroupBox | undefined {
  const members = board.components
    .filter((c) => c.group === g.id)
    .map((c) => positions[c.id])
    .filter((p): p is Point => p !== undefined)
  if (members.length === 0) return undefined
  const minX = Math.min(...members.map((p) => p.x))
  const minY = Math.min(...members.map((p) => p.y))
  const maxX = Math.max(...members.map((p) => p.x)) + CARD_WIDTH
  const maxY = Math.max(...members.map((p) => p.y)) + CARD_HEIGHT
  return {
    id: g.id,
    label: g.label,
    x: minX - GROUP_PADDING.side,
    y: minY - GROUP_PADDING.top,
    width: maxX - minX + GROUP_PADDING.side * 2,
    height: maxY - minY + GROUP_PADDING.top + GROUP_PADDING.bottom,
  }
}

export function groupBounds(board: Board, positions: Record<string, Point>): GroupBox[] {
  return board.groups.flatMap((g) => groupBox(board, g, positions) ?? [])
}

/** Where one connection is drawn and where its label sits. Identical shapes keep the same object. */
export interface EdgeShape {
  id: string
  from: string
  to: string
  sourceHandle: string
  targetHandle: string
  /** The drawn line. It leaves each card from a side and keeps out of the other cards. */
  path: string
  /** Where the label sits and how wide it is. Chosen to stay off card text and off other labels. */
  labelX: number
  labelY: number
  labelWidth: number
  labelLines: number
}

/** Everything the map draws that depends on where the cards are. The slow part of a build. */
export interface Geometry {
  edges: ReadonlyMap<string, EdgeShape>
  groups: readonly GroupBox[]
  /** Both ends of every drawn connection, in drawing order. */
  ends: readonly EdgeEnds[]
}

const manualId = (id: string) => `${MANUAL_PREFIX}${id}`

/** Routes every line, then places every label so it keeps off all of them. */
export function computeGeometry(board: Board, positions: Record<string, Point>, links: readonly ManualLink[] = []): Geometry {
  const boxOf = new Map<string, Rect>()
  for (const c of board.components) {
    const p = positions[c.id]
    if (p) boxOf.set(c.id, { x: p.x, y: p.y, width: CARD_WIDTH, height: CARD_HEIGHT })
  }
  const boxes = [...boxOf.values()]
  const obstacles = new Obstacles(boxes)
  const drawn = links.filter((l) => boxOf.has(l.from) && boxOf.has(l.to))
  const ends: EdgeEnds[] = [...board.relationships, ...drawn.map((l) => ({ id: manualId(l.id), from: l.from, to: l.to }))]
  const plans = planEdges(positions, ends)

  // Draw every line first, so each label can keep off all of them.
  const used: [Point, Point][] = []
  const routes: { id: string; from: string; to: string; text: string; route: Route }[] = []
  const route = (id: string, from: string, to: string, text: string) => {
    const plan = plans.get(id)
    const fromBox = boxOf.get(from)
    const toBox = boxOf.get(to)
    if (!plan || !fromBox || !toBox) return
    const drawnRoute = routeConnection(plan, boxes, [fromBox, toBox], used, obstacles)
    routes.push({ id, from, to, text, route: drawnRoute })
    if (drawnRoute.runs) used.push(...drawnRoute.runs)
  }
  for (const r of board.relationships) route(r.id, r.from, r.to, r.kind === 'unknown' ? `? ${r.label}` : r.label)
  for (const l of drawn) {
    // The chip adds a few characters, so the width is measured with them.
    route(manualId(l.id), l.from, l.to, l.label === '' ? 'Your link' : `You ${l.label}`)
  }

  const lines = new PointIndex()
  routes.forEach((r, i) => lines.add(i, r.route.points))
  const taken: Rect[] = []
  const edges = new Map<string, EdgeShape>()
  routes.forEach((r, i) => {
    const plan = plans.get(r.id)
    if (!plan) return
    const label = placeLabel(r.route.points, r.text, boxes, taken, lines, i)
    const height = pillHeight(label.lines)
    taken.push({ x: label.x - label.width / 2, y: label.y - height / 2, width: label.width, height })
    edges.set(r.id, {
      id: r.id,
      from: r.from,
      to: r.to,
      sourceHandle: `out-${plan.out}`,
      targetHandle: `in-${plan.in}`,
      path: r.route.d,
      labelX: label.x,
      labelY: label.y,
      labelWidth: label.width,
      labelLines: label.lines,
    })
  })
  return { edges, groups: groupBounds(board, positions), ends }
}

/**
 * The cheap update while a card moves. Only the connections of that card are redrawn, as plain curves with the
 * label at the middle, and only the group area around it. Every other shape keeps its object.
 */
export function moveCard(board: Board, geometry: Geometry, positions: Record<string, Point>, id: string): Geometry {
  const plans = planEdges(positions, geometry.ends)
  let edges: Map<string, EdgeShape> | undefined
  for (const [edgeId, shape] of geometry.edges) {
    if (shape.from !== id && shape.to !== id) continue
    const plan = plans.get(edgeId)
    if (!plan) continue
    const line = curve(plan.a, plan.out, plan.b, plan.in, plan.bend)
    const middle = line.points[Math.floor(line.points.length / 2)] ?? plan.a
    const next: EdgeShape = {
      ...shape,
      sourceHandle: `out-${plan.out}`,
      targetHandle: `in-${plan.in}`,
      path: line.d,
      labelX: middle.x,
      labelY: middle.y,
    }
    edges ??= new Map(geometry.edges)
    edges.set(edgeId, next)
  }
  const group = board.components.find((c) => c.id === id)?.group
  let groups = geometry.groups
  if (group !== undefined) {
    const def = board.groups.find((g) => g.id === group)
    const box = def ? groupBox(board, def, positions) : undefined
    if (box) groups = geometry.groups.map((g) => (g.id === group ? box : g))
  }
  return { edges: edges ?? geometry.edges, groups, ends: geometry.ends }
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

/** Turns the geometry and the current selection into React Flow nodes and edges. Cheap, so it runs on every change. */
export function assembleGraph(
  board: Board,
  positions: Record<string, Point>,
  geometry: Geometry,
  selection: Selection | undefined,
  highlight: ReadonlySet<string> | undefined,
  links: readonly ManualLink[],
  noteCounts: ReadonlyMap<string, number>,
  cache: GraphCache,
  /** The card being dragged. It is never dimmed. */
  held?: string,
): { nodes: Node[]; edges: Edge[] } {
  const playing = highlight !== undefined && highlight.size > 0
  const names = new Map(board.components.map((c) => [c.id, c.label]))
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

  const cards = board.components.map((c) =>
    stable(cache.nodes, {
      id: c.id,
      type: 'card',
      position: positions[c.id] ?? { x: 0, y: 0 },
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      data: {
        componentId: c.id,
        highlighted: playing && highlight.has(c.id),
        dimmed: playing && !highlight.has(c.id) && c.id !== selectedPart && c.id !== held,
        noteCount: noteCounts.get(c.id) ?? 0,
        label: c.label,
        summary: c.summary,
        sourceKind: c.source.kind,
        hasLesson: c.lesson !== undefined,
      },
      selected: c.id === selectedPart,
      connectable: true,
      deletable: false,
      ariaLabel: `${c.label}. ${c.summary}`,
    } satisfies Node<CardData>),
  )

  const edges: Edge[] = []
  for (const r of board.relationships) {
    const shape = geometry.edges.get(r.id)
    if (!shape) continue
    const selected = selection?.type === 'relationship' && selection.id === r.id
    const active = selected || (selectedPart !== undefined && (r.from === selectedPart || r.to === selectedPart))
    const highlighted = playing && highlight.has(r.id)
    const color = active || highlighted ? 'var(--accent)' : TONE_COLOR[KIND_STYLE[r.kind].tone]
    edges.push(
      stable(cache.edges, {
        id: r.id,
        type: 'relationship',
        source: r.from,
        target: r.to,
        sourceHandle: shape.sourceHandle,
        targetHandle: shape.targetHandle,
        selected,
        focusable: true,
        deletable: false,
        interactionWidth: 28,
        markerEnd: markerFor(color),
        ariaLabel: `${names.get(r.from) ?? r.from} ${r.kind === 'unknown' ? 'connects to' : KIND_WORDS[r.kind]} ${names.get(r.to) ?? r.to}: ${r.label}`,
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
        sourceHandle: shape.sourceHandle,
        targetHandle: shape.targetHandle,
        selected,
        focusable: true,
        deletable: false,
        interactionWidth: 28,
        markerEnd: markerFor(active ? 'var(--accent)' : 'var(--ink)'),
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
        },
      } satisfies Edge<ManualEdgeData>),
    )
  }

  const nodes = [...groups, ...cards]
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
  positions: Record<string, Point>,
  selection: Selection | undefined,
  /** IDs of the parts and connections a walkthrough step is about. Undefined or empty shows everything. */
  highlight?: ReadonlySet<string>,
  /** Links the user drew. A link whose end is missing is not drawn. */
  links: readonly ManualLink[] = [],
  /** Notes and questions per part ID. */
  noteCounts: ReadonlyMap<string, number> = new Map(),
): { nodes: Node[]; edges: Edge[] } {
  const geometry = computeGeometry(board, positions, links)
  return assembleGraph(board, positions, geometry, selection, highlight, links, noteCounts, new GraphCache())
}
