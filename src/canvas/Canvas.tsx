import {
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  type EdgeChange,
  type Connection,
  type NodeChange,
  type NodeTypes,
  useReactFlow,
  useStore,
  type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { currentStep } from '../scenarios/step'
import { useAppDispatch, useAppState } from '../app/appContext'
import { CARD_HEIGHT, CARD_WIDTH } from '../overlay/layout'
import type { Point } from '../overlay/types'
import { newId } from '../overlay/notes'
import type { Board } from '../board/schema'
import type { ManualLink } from '../overlay/types'
import { assembleGraph, computeGeometry, GraphCache, MANUAL_PREFIX, moveCard, type Geometry } from './buildGraph'
import { CardNode } from './CardNode'
import styles from './Canvas.module.css'
import { GroupNode } from './GroupNode'
import { Legend } from './Legend'
import { ManualEdge } from './ManualEdge'
import { RelationshipEdge } from './RelationshipEdge'

const nodeTypes: NodeTypes = { card: CardNode, 'group-area': GroupNode }
const edgeTypes: EdgeTypes = { relationship: RelationshipEdge, 'manual-link': ManualEdge }
const ARIA_LABELS = {
  'node.a11yDescription.keyboardDisabled': 'Press Enter to select this part. Then use the arrow keys to move it. Press Escape to go back to the overview.',
  'node.a11yDescription.default': 'Press Enter to select this part. Press Escape to go back to the overview.',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }: { direction: string; x: number; y: number }) =>
    `Moved ${direction}. Position ${x}, ${y}.`,
  'edge.a11yDescription.default': 'Press Enter to select this connection. Press Escape to go back to the overview.',
}
/**
 * Keeps the selected part in view. On a narrow screen the whole map is tiny, so it zooms in on the part.
 * A part picked on the map itself (a click, or the start of a drag) is under the pointer already, so the view stays put.
 */
function KeepSelectionInView({ takePicked }: { takePicked: () => string | undefined }) {
  const { selection, board } = useAppState()
  const flow = useReactFlow()
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const previous = useRef<string | undefined>(undefined)
  const key = selection && selection.type !== 'board' ? `${selection.type}:${selection.id}` : undefined

  useEffect(() => {
    if (previous.current === key) return
    previous.current = key
    const here = takePicked()
    if (selection?.type === 'component' && here === selection.id) return
    if (!selection || selection.type === 'board' || !board) return
    const narrow = width > 0 && width < 600
    if (selection.type === 'relationship') {
      const r = board.relationships.find((x) => x.id === selection.id)
      if (r && narrow) void flow.fitView({ nodes: [{ id: r.from }, { id: r.to }], padding: 0.25, maxZoom: 0.9, duration: 0 })
      return
    }
    const node = flow.getNode(selection.id)
    if (!node) return
    const { zoom, x, y } = flow.getViewport()
    const left = node.position.x * zoom + x
    const top = node.position.y * zoom + y
    const visible = left >= 0 && top >= 0 && left + CARD_WIDTH * zoom <= width && top + CARD_HEIGHT * zoom <= height
    if (narrow || !visible) {
      void flow.setCenter(node.position.x + CARD_WIDTH / 2, node.position.y + CARD_HEIGHT / 2, {
        zoom: narrow ? Math.max(zoom, 0.8) : zoom,
        duration: 0,
      })
    }
  }, [key, selection, board, flow, width, height, takePicked])

  return null
}

const FIT = { padding: 0.12, maxZoom: 1, duration: 0 }
const STEP_MS = 220
const RESIZE_MS = 150

function prefersStillness(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Frames the map. A walkthrough step frames the parts it is about, and the whole board
 * when it names none. Resizing the window frames it again, so the map never ends up off screen.
 */
function Camera({ stepKey, focus, dragging }: { stepKey: string | undefined; focus: readonly string[]; dragging: boolean }) {
  const flow = useReactFlow()
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const latest = useRef({ stepKey, focus })
  const size = useRef({ width, height })
  const shown = useRef<string | undefined>(undefined)
  const busy = useRef(dragging)
  const waiting = useRef(false)

  useEffect(() => {
    latest.current = { stepKey, focus }
  })

  const fit = useCallback(
    (animate: boolean) => {
      const { stepKey: key, focus: parts } = latest.current
      const duration = animate && !prefersStillness() ? STEP_MS : 0
      if (key !== undefined && parts.length > 0) {
        void flow.fitView({ nodes: parts.map((id) => ({ id })), padding: 0.25, maxZoom: 1.1, duration })
      } else {
        void flow.fitView({ ...FIT, duration })
      }
    },
    [flow],
  )

  useEffect(() => {
    if (shown.current === stepKey) return
    const before = shown.current
    shown.current = stepKey
    // The first frame belongs to the `fitView` prop. A walkthrough that ends frames the whole board.
    if (before === undefined && stepKey === undefined) return
    fit(true)
  }, [stepKey, fit])

  useEffect(() => {
    const was = size.current
    if (was.width === width && was.height === height) return
    size.current = { width, height }
    if (was.width === 0 || was.height === 0 || width === 0 || height === 0) return
    const timer = window.setTimeout(() => {
      // Refitting under a held card would move it away from the pointer. It waits for the drop.
      if (busy.current) waiting.current = true
      else fit(false)
    }, RESIZE_MS)
    return () => window.clearTimeout(timer)
  }, [width, height, fit])

  useEffect(() => {
    busy.current = dragging
    if (dragging || !waiting.current) return
    waiting.current = false
    fit(false)
  }, [dragging, fit])

  return null
}

/** The map as it is drawn now. While a card moves, the lines are cheap curves. A full build follows the drop. */
interface View {
  board: Board
  links: readonly ManualLink[] | undefined
  /** The stored positions this view was built from. */
  base: Record<string, Point> | undefined
  positions: Record<string, Point>
  geometry: Geometry
  /** The card under the pointer. */
  held?: string
  /** Set while the lines are cheap curves: milliseconds to wait before the full build. */
  settle?: number
}

function fullView(board: Board, base: Record<string, Point> | undefined, links: readonly ManualLink[] | undefined, positions = base ?? {}): View {
  return { board, links, base, positions, geometry: computeGeometry(board, positions, links ?? []) }
}

function samePositions(a: Record<string, Point> | undefined, b: Record<string, Point>): boolean {
  const mine = a ?? {}
  const keys = Object.keys(mine)
  return keys.length === Object.keys(b).length && keys.every((k) => b[k]?.x === mine[k]?.x && b[k]?.y === mine[k]?.y)
}

function moved(view: View, id: string, point: Point, settle: number): View {
  const at = view.positions[id]
  if (at && at.x === point.x && at.y === point.y) return view
  const positions = { ...view.positions, [id]: { x: point.x, y: point.y } }
  return { ...view, positions, geometry: moveCard(view.board, view.geometry, positions, id), settle }
}

/** Arrow keys repeat quickly. The full build and the save wait until they stop. */
const KEY_SETTLE_MS = 250

/** Runs after the next frame has been drawn, so a drop shows before the slow work starts. */
function afterPaint(run: () => void): () => void {
  let timer: number | undefined
  const frame = window.requestAnimationFrame(() => {
    timer = window.setTimeout(run, 0)
  })
  return () => {
    window.cancelAnimationFrame(frame)
    if (timer !== undefined) window.clearTimeout(timer)
  }
}

interface Drag {
  id: string
  /** The map as it was when the card was picked up. Escape puts it back. */
  before: View
  cancelled: boolean
}

export function Canvas() {
  const state = useAppState()
  const { board, overlay, selection } = state
  const dispatch = useAppDispatch()
  const stored = overlay?.positions
  const links = overlay?.manualLinks
  const [view, setView] = useState<View | undefined>(() => (board ? fullView(board, stored, links) : undefined))
  // The map is rebuilt in full when the board or the links change, or when positions change from outside the map.
  let shown = view
  if (board && (!view || view.board !== board || view.links !== links)) {
    shown = fullView(board, stored, links)
    setView(shown)
  } else if (view && stored !== view.base) {
    shown = samePositions(stored, view.positions) ? { ...view, base: stored } : fullView(view.board, stored, view.links)
    setView(shown)
  }
  const viewRef = useRef(shown)
  const drag = useRef<Drag | undefined>(undefined)
  const keyMoves = useRef(new Set<string>())
  const pickedOnMap = useRef<string | undefined>(undefined)
  const playing = useRef(false)
  const [cache] = useState(() => new GraphCache())
  const takePicked = useCallback(() => {
    const id = pickedOnMap.current
    pickedOnMap.current = undefined
    return id
  }, [])

  const step = useMemo(() => currentStep({ board: state.board, scenario: state.scenario }), [state.board, state.scenario])
  useEffect(() => {
    viewRef.current = shown
    playing.current = step !== undefined
  })
  const noteCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of overlay?.notes ?? []) {
      if (n.target.type === 'component') counts.set(n.target.id, (counts.get(n.target.id) ?? 0) + 1)
    }
    return counts
  }, [overlay?.notes])
  const graph = useMemo(
    () => (board && shown ? assembleGraph(board, shown.positions, shown.geometry, selection, step?.highlight, links ?? [], noteCounts, cache, shown.held) : undefined),
    [board, shown, selection, step, links, noteCounts, cache],
  )

  // The full build comes after the drop, or after the last arrow key, and so does the save of keyboard moves.
  const settle = shown?.held === undefined ? shown?.settle : undefined
  useEffect(() => {
    if (settle === undefined) return
    const settleNow = () => {
      const current = viewRef.current
      if (!current) return
      for (const id of keyMoves.current) {
        const point = current.positions[id]
        if (point) dispatch({ type: 'cardMoved', id, point })
      }
      keyMoves.current.clear()
      setView((v) => (v && v.settle !== undefined && v.held === undefined ? fullView(v.board, v.base, v.links, v.positions) : v))
    }
    return settle === 0 ? afterPaint(settleNow) : cancelTimer(window.setTimeout(settleNow, settle))
  }, [settle, shown, dispatch])

  // Escape while a card is held puts it back and leaves the selection and focus alone.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const held = drag.current
      if (event.key !== 'Escape' || !held) return
      event.stopPropagation()
      event.preventDefault()
      if (held.cancelled) return
      held.cancelled = true
      setView((v) => (v ? { ...v, positions: held.before.positions, geometry: held.before.geometry, ...(held.before.settle === undefined ? {} : { settle: held.before.settle }) } : v))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // A keyboard move that has not been saved yet is saved when the map goes away.
  useEffect(
    () => () => {
      const current = viewRef.current
      for (const id of keyMoves.current) {
        const point = current?.positions[id]
        if (point) dispatch({ type: 'cardMoved', id, point })
      }
    },
    [dispatch],
  )
  const [connecting, setConnecting] = useState(false)
  const stepKey = step ? `${step.scenario.id}:${step.index}` : undefined

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (!('id' in change) || change.id.startsWith('group:')) continue
        if (change.type === 'position' && change.position) {
          const { id, position } = change
          const held = drag.current
          if (held) {
            // A drag saves once, when the card is dropped.
            if (!held.cancelled) setView((v) => (v ? moved(v, id, position, 0) : v))
          } else {
            // Arrow keys move a card without a drag.
            keyMoves.current.add(id)
            setView((v) => (v ? moved(v, id, position, KEY_SETTLE_MS) : v))
          }
        } else if (change.type === 'select' && change.selected) {
          // While a walkthrough plays, picking up a card must not change what the panel shows. A click still does.
          if (playing.current) continue
          pickedOnMap.current = change.id
          dispatch({ type: 'select', selection: { type: 'component', id: change.id } })
        }
      }
    },
    [dispatch],
  )

  const onDragStart = useCallback((_: unknown, node: { id: string }) => {
    const before = viewRef.current
    if (!before) return
    drag.current = { id: node.id, before, cancelled: false }
    setView((v) => (v ? { ...v, held: node.id } : v))
  }, [])

  const onDragStop = useCallback(
    (_: unknown, node: { id: string; position: Point }) => {
      const held = drag.current
      drag.current = undefined
      setView((v) => {
        if (!v) return v
        const { held: _dropped, ...rest } = v
        return rest
      })
      if (!held || held.cancelled) return
      keyMoves.current.delete(node.id)
      dispatch({ type: 'cardMoved', id: node.id, point: node.position })
    },
    [dispatch],
  )

  // During a walkthrough a click on a part still opens it. Picking a part up does not.
  const onNodeClick = useCallback(
    (_: unknown, node: { id: string }) => {
      if (!playing.current || node.id.startsWith('group:')) return
      pickedOnMap.current = node.id
      dispatch({ type: 'select', selection: { type: 'component', id: node.id } })
    },
    [dispatch],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'select' && change.selected) {
          dispatch({
            type: 'select',
            selection: change.id.startsWith(MANUAL_PREFIX)
              ? { type: 'link', id: change.id.slice(MANUAL_PREFIX.length) }
              : { type: 'relationship', id: change.id },
          })
        }
      }
    },
    [dispatch],
  )

  // Dragging from one card's handle to another draws a link. It is always the user's own annotation.
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return
      const id = newId('link')
      dispatch({ type: 'linkAdded', from: connection.source, to: connection.target, label: '', id, now: new Date() })
      dispatch({ type: 'select', selection: { type: 'link', id } })
    },
    [dispatch],
  )

  if (!board || !graph) return null

  return (
    <div className={styles.canvas} data-connecting={connecting || undefined}>
      <ReactFlow
        key={board.id}
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onDragStart}
        onNodeDragStop={onDragStop}
        onNodeClick={onNodeClick}
        autoPanOnNodeDrag={false}
        panOnScroll
        panOnScrollSpeed={0.8}
        zoomOnScroll={false}
        zoomOnPinch
        onPaneClick={() => dispatch({ type: 'select', selection: { type: 'board' } })}
        fitView
        fitViewOptions={FIT}
        minZoom={0.15}
        maxZoom={1.6}
        nodesConnectable
        connectionMode={ConnectionMode.Loose}
        onConnect={onConnect}
        onConnectStart={() => setConnecting(true)}
        onConnectEnd={() => setConnecting(false)}
        edgesFocusable
        nodesFocusable
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        zoomOnDoubleClick={false}
        ariaLabelConfig={ARIA_LABELS}
        aria-label="Map of the board"
      >
        <Background gap={24} size={1.2} className={styles.dots ?? ""} />
        <KeepSelectionInView takePicked={takePicked} />
        <Camera stepKey={stepKey} focus={step?.focusParts ?? []} dragging={shown?.held !== undefined} />
        <Controls showInteractive={false} fitViewOptions={FIT} position="bottom-right" />
      </ReactFlow>
      <Legend />
    </div>
  )
}

function cancelTimer(id: number): () => void {
  return () => window.clearTimeout(id)
}
