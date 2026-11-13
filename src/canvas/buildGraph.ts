import { getBezierPath, MarkerType, Position, type Edge, type Node } from '@xyflow/react'
import type { Board, BoardRelationship } from '../board/schema'
import { KIND_WORDS } from '../app/labels'
import type { Selection } from '../app/state'
import { CARD_HEIGHT, CARD_WIDTH } from '../overlay/layout'
import type { Point } from '../overlay/types'
import { LABEL_HEIGHT, placeLabel, type Rect } from './labelPlacement'
import { KIND_STYLE, TONE_COLOR } from './kinds'

export const GROUP_PADDING = { side: 24, top: 46, bottom: 24 }

export type Side = 'left' | 'right' | 'top' | 'bottom'
export const SIDE_POSITION: Record<Side, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
}

export interface CardData extends Record<string, unknown> {
  componentId: string
}
export interface GroupData extends Record<string, unknown> {
  label: string
}
export interface EdgeData extends Record<string, unknown> {
  relationshipId: string
  label: string
  kind: BoardRelationship['kind']
  active: boolean
  /** Where the label sits and how wide it may be. Chosen to stay off the cards and off other labels. */
  labelX: number
  labelY: number
  labelWidth: number
}

/** Which sides of the two cards a connection leaves from and arrives at. */
export function pickSides(from: Point, to: Point): { out: Side; in: Side } {
  if (to.x >= from.x + CARD_WIDTH) return { out: 'right', in: 'left' }
  if (to.x + CARD_WIDTH <= from.x) return { out: 'left', in: 'right' }
  return to.y >= from.y ? { out: 'bottom', in: 'top' } : { out: 'top', in: 'bottom' }
}

/** Where a connection meets a card: the middle of the chosen side. */
function anchor(p: Point, side: Side): { x: number; y: number } {
  if (side === 'left') return { x: p.x, y: p.y + CARD_HEIGHT / 2 }
  if (side === 'right') return { x: p.x + CARD_WIDTH, y: p.y + CARD_HEIGHT / 2 }
  if (side === 'top') return { x: p.x + CARD_WIDTH / 2, y: p.y }
  return { x: p.x + CARD_WIDTH / 2, y: p.y + CARD_HEIGHT }
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
): { nodes: Node[]; edges: Edge[] } {
  const boxes: Rect[] = board.components.flatMap((c) => {
    const p = positions[c.id]
    return p ? [{ x: p.x, y: p.y, width: CARD_WIDTH, height: CARD_HEIGHT }] : []
  })
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
    data: { componentId: c.id },
    selected: selection?.type === 'component' && selection.id === c.id,
    connectable: false,
    deletable: false,
    ariaLabel: `${c.label}. ${c.summary}`,
  }))

  const selectedPart = selection?.type === 'component' ? selection.id : undefined
  const taken: Rect[] = []
  const edges: Edge<EdgeData>[] = board.relationships.flatMap((r) => {
    const from = positions[r.from]
    const to = positions[r.to]
    if (!from || !to) return []
    const sides = pickSides(from, to)
    const selected = selection?.type === 'relationship' && selection.id === r.id
    const active = selected || (selectedPart !== undefined && (r.from === selectedPart || r.to === selectedPart))
    const style = KIND_STYLE[r.kind]
    const a = anchor(from, sides.out)
    const b = anchor(to, sides.in)
    const [path, middleX, middleY] = getBezierPath({
      sourceX: a.x,
      sourceY: a.y,
      sourcePosition: SIDE_POSITION[sides.out],
      targetX: b.x,
      targetY: b.y,
      targetPosition: SIDE_POSITION[sides.in],
    })
    const text = r.kind === 'unknown' ? `? ${r.label}` : r.label
    const label = placeLabel(path, text.length * 6.6 + 20, boxes, taken, { x: middleX, y: middleY })
    taken.push({ x: label.x - label.width / 2, y: label.y - LABEL_HEIGHT / 2, width: label.width, height: LABEL_HEIGHT })
    const color = active ? 'var(--accent)' : TONE_COLOR[style.tone]
    return [
      {
        id: r.id,
        type: 'relationship',
        source: r.from,
        target: r.to,
        sourceHandle: `out-${sides.out}`,
        targetHandle: `in-${sides.in}`,
        selected,
        focusable: true,
        deletable: false,
        interactionWidth: 28,
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        ariaLabel: `${names.get(r.from) ?? r.from} ${KIND_WORDS[r.kind]} ${names.get(r.to) ?? r.to}: ${r.label}`,
        data: { relationshipId: r.id, label: r.label, kind: r.kind, active, labelX: label.x, labelY: label.y, labelWidth: label.width },
      },
    ]
  })

  return { nodes: [...groups, ...cards], edges }
}
