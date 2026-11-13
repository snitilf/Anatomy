import { MarkerType, Position, type Edge, type Node } from '@xyflow/react'
import type { Board, BoardRelationship } from '../board/schema'
import { KIND_WORDS } from '../app/labels'
import type { Selection } from '../app/state'
import { CARD_HEIGHT, CARD_WIDTH } from '../overlay/layout'
import type { ManualLink, Point } from '../overlay/types'
import { pillHeight, placeLabel } from './labelPlacement'
import { planEdges, routeConnection, type Rect, type Route, type Side } from './routing'
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
}
export interface ManualEdgeData extends Record<string, unknown> {
  linkId: string
  /** The words on the pill: the link's label, or "Your link". */
  text: string
  hasLabel: boolean
  active: boolean
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
  /** The drawn line. It leaves each card from a side and keeps out of the other cards. */
  path: string
  /** Where the label sits and how wide it is. Chosen to stay off card text and off other labels. */
  labelX: number
  labelY: number
  labelWidth: number
  labelLines: number
}

export function groupBounds(board: Board, positions: Record<string, Point>) {
  const out: { id: string; label: string; x: number; y: number; width: number; height: number }[] = []
  for (const g of board.groups) {
    const members = board.components
      .filter((c) => c.group === g.id)
      .map((c) => positions[c.id])
      .filter((p): p is Point => p !== undefined)
    if (members.length === 0) continue
    const minX = Math.min(...members.map((p) => p.x))
    const minY = Math.min(...members.map((p) => p.y))
    const maxX = Math.max(...members.map((p) => p.x)) + CARD_WIDTH
    const maxY = Math.max(...members.map((p) => p.y)) + CARD_HEIGHT
    out.push({
      id: g.id,
      label: g.label,
      x: minX - GROUP_PADDING.side,
      y: minY - GROUP_PADDING.top,
      width: maxX - minX + GROUP_PADDING.side * 2,
      height: maxY - minY + GROUP_PADDING.top + GROUP_PADDING.bottom,
    })
  }
  return out
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
  const playing = highlight !== undefined && highlight.size > 0
  const boxOf = new Map<string, Rect>()
  for (const c of board.components) {
    const p = positions[c.id]
    if (p) boxOf.set(c.id, { x: p.x, y: p.y, width: CARD_WIDTH, height: CARD_HEIGHT })
  }
  const boxes = [...boxOf.values()]
  const names = new Map(board.components.map((c) => [c.id, c.label]))

  const groups: Node<GroupData>[] = groupBounds(board, positions).map((g) => ({
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
  }))

  const cards: Node<CardData>[] = board.components.map((c) => ({
    id: c.id,
    type: 'card',
    position: positions[c.id] ?? { x: 0, y: 0 },
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    data: {
      componentId: c.id,
      highlighted: playing && highlight.has(c.id),
      dimmed: playing && !highlight.has(c.id),
      noteCount: noteCounts.get(c.id) ?? 0,
    },
    selected: selection?.type === 'component' && selection.id === c.id,
    connectable: true,
    deletable: false,
    ariaLabel: `${c.label}. ${c.summary}`,
  }))

  const selectedPart = selection?.type === 'component' ? selection.id : undefined
  const drawn = links.filter((l) => boxOf.has(l.from) && boxOf.has(l.to))
  const manualId = (id: string) => `${MANUAL_PREFIX}${id}`
  const plans = planEdges(positions, [
    ...board.relationships,
    ...drawn.map((l) => ({ id: manualId(l.id), from: l.from, to: l.to })),
  ])
  // Draw every line first, so each label can keep off all of them.
  const used: [Point, Point][] = []
  const routes = new Map<string, Route>()
  for (const r of board.relationships) {
    const plan = plans.get(r.id)
    const fromBox = boxOf.get(r.from)
    const toBox = boxOf.get(r.to)
    if (!plan || !fromBox || !toBox) continue
    const route = routeConnection(plan, boxes, [fromBox, toBox], used)
    routes.set(r.id, route)
    if (route.runs) used.push(...route.runs)
  }

  const manualRoutes = new Map<string, Route>()
  for (const l of drawn) {
    const plan = plans.get(manualId(l.id))
    const fromBox = boxOf.get(l.from)
    const toBox = boxOf.get(l.to)
    if (!plan || !fromBox || !toBox) continue
    const route = routeConnection(plan, boxes, [fromBox, toBox], used)
    manualRoutes.set(l.id, route)
    if (route.runs) used.push(...route.runs)
  }
  const allRoutes = new Map<string, Route>([...routes, ...[...manualRoutes].map(([id, r]): [string, Route] => [manualId(id), r])])

  const taken: Rect[] = []
  const edges: Edge<EdgeData>[] = board.relationships.flatMap((r) => {
    const plan = plans.get(r.id)
    const route = routes.get(r.id)
    if (!plan || !route) return []
    const selected = selection?.type === 'relationship' && selection.id === r.id
    const active = selected || (selectedPart !== undefined && (r.from === selectedPart || r.to === selectedPart))
    const highlighted = playing && highlight.has(r.id)
    const style = KIND_STYLE[r.kind]
    const text = r.kind === 'unknown' ? `? ${r.label}` : r.label
    const otherLines = [...allRoutes].flatMap(([id, other]) => (id === r.id ? [] : other.points))
    const label = placeLabel(route.points, text, boxes, taken, otherLines)
    const height = pillHeight(label.lines)
    taken.push({ x: label.x - label.width / 2, y: label.y - height / 2, width: label.width, height })
    const color = active || highlighted ? 'var(--accent)' : TONE_COLOR[style.tone]
    return [
      {
        id: r.id,
        type: 'relationship',
        source: r.from,
        target: r.to,
        sourceHandle: `out-${plan.out}`,
        targetHandle: `in-${plan.in}`,
        selected,
        focusable: true,
        deletable: false,
        interactionWidth: 28,
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        ariaLabel: `${names.get(r.from) ?? r.from} ${KIND_WORDS[r.kind]} ${names.get(r.to) ?? r.to}: ${r.label}`,
        data: {
          relationshipId: r.id,
          label: r.label,
          kind: r.kind,
          active,
          highlighted,
          dimmed: playing && !highlighted,
          path: route.d,
          labelX: label.x,
          labelY: label.y,
          labelWidth: label.width,
          labelLines: label.lines,
        },
      },
    ]
  })

  const manual: Edge<ManualEdgeData>[] = drawn.flatMap((l) => {
    const plan = plans.get(manualId(l.id))
    const fromBox = boxOf.get(l.from)
    const toBox = boxOf.get(l.to)
    if (!plan || !fromBox || !toBox) return []
    const route = manualRoutes.get(l.id)
    if (!route) return []
    const selected = selection?.type === 'link' && selection.id === l.id
    const active = selected || (selectedPart !== undefined && (l.from === selectedPart || l.to === selectedPart))
    const text = l.label === '' ? 'Your link' : l.label
    const otherLines = [...allRoutes].flatMap(([id, other]) => (id === manualId(l.id) ? [] : other.points))
    // The chip adds a few characters, so the width is measured with them.
    const label = placeLabel(route.points, l.label === '' ? text : `You ${text}`, boxes, taken, otherLines)
    const height = pillHeight(label.lines)
    taken.push({ x: label.x - label.width / 2, y: label.y - height / 2, width: label.width, height })
    const color = active ? 'var(--accent)' : 'var(--ink)'
    return [
      {
        id: manualId(l.id),
        type: 'manual-link',
        source: l.from,
        target: l.to,
        sourceHandle: `out-${plan.out}`,
        targetHandle: `in-${plan.in}`,
        selected,
        focusable: true,
        deletable: false,
        interactionWidth: 28,
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        ariaLabel: `Your link from ${names.get(l.from) ?? l.from} to ${names.get(l.to) ?? l.to}${l.label === '' ? '' : `: ${l.label}`}`,
        data: {
          linkId: l.id,
          text,
          hasLabel: l.label !== '',
          active,
          path: route.d,
          labelX: label.x,
          labelY: label.y,
          labelWidth: label.width,
          labelLines: label.lines,
        },
      },
    ]
  })

  return { nodes: [...groups, ...cards], edges: [...edges, ...manual] }
}
