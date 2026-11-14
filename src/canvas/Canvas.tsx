import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  type EdgeChange,
  type Connection,
  type NodeChange,
  type NodeTypes,
  type EdgeTypes,
  type FinalConnectionState,
  type ReactFlowInstance,
  type Viewport,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { currentStep } from '../scenarios/step'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useAppDispatch, useAppStore } from '../app/store'
import { CARD_MAX, CARD_MIN, CARD_WIDTH, groupAreas, placeCards, snap, type CardPlacement } from '../layout/cards'
import type { Point, Rect, Size } from '../layout/geometry'
import { pushApart } from '../layout/push'
import { newId } from '../layer/edits'
import type { Board } from '../board/schema'
import type { Link } from '../layer/model'
import { assembleGraph, computeGeometry, GraphCache, MANUAL_PREFIX, moveCard, type Geometry } from './buildGraph'
import { contentBounds, coveredTop, frameViewport, MAX_ZOOM, moveCamera, viewportShowing, zoomLimits, type Limits } from './camera'
import { CameraContext, prefersStillness, type Camera as CameraApi } from './cameraContext'
import { Camera, KeepInLimits, KeepSelectionInView, LabelMode, WheelZoom } from './CameraControls'
import { CardNode } from './CardNode'
import styles from './Canvas.module.css'
import { GroupNode } from './GroupNode'
import { MapHint } from './MapHint'
import { ManualEdge } from './ManualEdge'
import { RelationshipEdge } from './RelationshipEdge'
import { inView, SNAP_PX, SnapTargets } from './snap'
import { SnapGuides, type GuideLines } from './SnapGuides'
import { ZoomBar } from './ZoomBar'

const nodeTypes: NodeTypes = { card: CardNode, 'group-area': GroupNode }
const edgeTypes: EdgeTypes = { relationship: RelationshipEdge, 'manual-link': ManualEdge }
const ARIA_LABELS = {
  'node.a11yDescription.keyboardDisabled': 'Press Enter to select this part. Then use the arrow keys to move it. Press Escape to go back to the overview.',
  'node.a11yDescription.default': 'Press Enter to select this part. Press Escape to go back to the overview.',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }: { direction: string; x: number; y: number }) =>
    `Moved ${direction}. Position ${x}, ${y}.`,
  'edge.a11yDescription.default': 'Press Enter to select this connection. Press Escape to go back to the overview.',
}

/** The map as it is drawn now. While a card moves, the lines are cheap elbows. A full build follows the drop. */
interface View {
  board: Board
  links: readonly Link[] | undefined
  /** The stored positions and sizes this view was built from. */
  base: CardPlacement | undefined
  rects: Record<string, Rect>
  geometry: Geometry
  /** The card under the pointer, moved or resized. */
  held?: string
  /** Set while the lines are cheap elbows: milliseconds to wait before the full build. */
  settle?: number
}

const NO_PLACEMENT: CardPlacement = { positions: {}, sizes: {} }

/** `previous` is the map of the same board and links. Lines that nothing has moved into keep their place. */
function fullView(
  board: Board,
  base: CardPlacement | undefined,
  links: readonly Link[] | undefined,
  rects = placeCards(board, base ?? NO_PLACEMENT),
  previous?: Geometry,
): View {
  return { board, links, base, rects, geometry: computeGeometry(board, rects, links ?? [], previous) }
}

function sameRects(a: Record<string, Rect>, b: Record<string, Rect>): boolean {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => {
      const p = a[k]
      const q = b[k]
      return p !== undefined && q !== undefined && p.x === q.x && p.y === q.y && p.width === q.width && p.height === q.height
    })
  )
}

/** The cheap update for one card that moved or changed size: only its own lines and its group area are redrawn. */
function changed(view: View, id: string, rect: Rect, settle: number): View {
  const at = view.rects[id]
  if (!at || (at.x === rect.x && at.y === rect.y && at.width === rect.width && at.height === rect.height)) return view
  const rects = { ...view.rects, [id]: rect }
  return { ...view, rects, geometry: moveCard(view.board, view.geometry, rects, id), settle }
}

/** Arrow keys repeat quickly. The full build and the save wait until they stop. */
const KEY_SETTLE_MS = 250
const DROP_PAN_MS = 160
/** How long cards glide when a drop pushes them aside. */
const PUSH_MS = 150

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

/** A card in hand: moved by a drag, or resized from its corner. */
interface Hold {
  id: string
  kind: 'drag' | 'resize'
  /** The map as it was when the card was picked up. Escape puts it back. */
  before: View
  cancelled: boolean
  /** The edges and middles of the other cards in view, for the alignment guides. */
  targets: SnapTargets
  /** Snapping reach in board pixels at the zoom of the moment. */
  reach: number
}

/** Moves the cards that a dropped or resized card covers out of its way. Group areas are taken from before the change. */
function pushAside(view: View, ids: readonly string[], before: View): Record<string, Point> {
  const groupOf = new Map(view.board.components.map((c) => [c.id, c.group]))
  return pushApart(view.rects, new Set(ids), { groupOf: (id) => groupOf.get(id), areas: groupAreas(view.board, before.rects) })
}

/** The cards in the first column on the left, where the flow starts. */
function flowStart(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined
  const left = Math.min(...rects.map((r) => r.x))
  const first = rects.filter((r) => r.x < left + CARD_WIDTH)
  const top = Math.min(...first.map((r) => r.y))
  return { x: left, y: top, width: CARD_WIDTH, height: Math.max(...first.map((r) => r.y + r.height)) - top }
}

const clampTo = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** More connections than this, or more than this many per card, and labels give way below the full-label zoom. */
const CROWDED_LINES = 20
const CROWDED_RATIO = 1.5

export function Canvas() {
  const { board, positions, sizes, links, notes, marks, proposals, selection, scenario } = useAppStore(
    useShallow((s) => ({
      board: s.board,
      positions: s.layer?.positions,
      sizes: s.layer?.sizes,
      links: s.layer?.links,
      notes: s.layer?.notes,
      marks: s.layer?.marks,
      proposals: s.layer?.proposals,
      selection: s.selection,
      scenario: s.scenario,
    })),
  )
  const stored = useMemo(() => (positions && sizes ? { positions, sizes } : undefined), [positions, sizes])
  const dispatch = useAppDispatch()
  const [view, setView] = useState<View | undefined>(() => (board ? fullView(board, stored, links) : undefined))
  // The map is rebuilt in full when the board or the links change, or when positions or sizes change from outside the map.
  let shown = view
  if (board && (!view || view.board !== board || view.links !== links)) {
    shown = fullView(board, stored, links)
    setView(shown)
  } else if (view && stored !== view.base) {
    const rects = placeCards(view.board, stored ?? NO_PLACEMENT)
    shown = sameRects(rects, view.rects) ? { ...view, base: stored } : fullView(view.board, stored, view.links, rects, view.geometry)
    setView(shown)
  }
  const viewRef = useRef(shown)
  const hold = useRef<Hold | undefined>(undefined)
  const keyMoves = useRef(new Set<string>())
  const pickedOnMap = useRef<string | undefined>(undefined)
  const playing = useRef(false)
  const guides = useRef<GuideLines>(null)
  const hoverStyle = useRef<HTMLStyleElement>(null)
  /** Cards that a drop just pushed aside. They glide to their new place. */
  const [pushed, setPushed] = useState<ReadonlySet<string> | undefined>(undefined)
  const showPushed = useCallback((ids: readonly string[]) => {
    if (ids.length === 0 || prefersStillness()) return
    setPushed(new Set(ids))
  }, [])
  useEffect(() => {
    if (!pushed) return
    const timer = window.setTimeout(() => setPushed(undefined), PUSH_MS + 60)
    return () => window.clearTimeout(timer)
  }, [pushed])

  /** Arrow-key moves are saved together, as one step of undo, once the keys stop. Cards they cover step aside. */
  const saveKeyMoves = useCallback(
    (current: View) => {
      const moves: Record<string, Point> = {}
      for (const id of keyMoves.current) {
        const rect = current.rects[id]
        if (rect) moves[id] = { x: rect.x, y: rect.y }
      }
      keyMoves.current.clear()
      if (Object.keys(moves).length === 0) return
      const aside = pushAside(current, Object.keys(moves), current)
      dispatch({ type: 'cardsMoved', positions: { ...aside, ...moves } })
      showPushed(Object.keys(aside))
    },
    [dispatch, showPushed],
  )
  const [cache] = useState(() => new GraphCache())
  const mapBox = useRef<HTMLDivElement>(null)
  const flowRef = useRef<ReactFlowInstance | undefined>(undefined)
  const setFlow = useCallback((flow: ReactFlowInstance) => {
    flowRef.current = flow
  }, [])
  /** Labels give way on a crowded map below the full-label zoom. Only the selection's and the hovered card's show. */
  const [quiet, setQuiet] = useState(false)
  const takePicked = useCallback(() => {
    const id = pickedOnMap.current
    pickedOnMap.current = undefined
    return id
  }, [])

  // The size of the map, for the zoom limits. Read before the first paint and on every change.
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = mapBox.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setMapSize((s) => (s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [board])

  // The limits follow what is on the map once it is solved, never a card in hand.
  const solved = shown?.geometry.solved
  const bounds = useMemo(
    () => (board && solved ? contentBounds(Object.values(solved), Object.values(groupAreas(board, solved)), marks, proposals) : undefined),
    [board, solved, marks, proposals],
  )
  const limits = useMemo(() => zoomLimits(bounds, mapSize), [bounds, mapSize])
  const boundsRef = useRef(bounds)
  useLayoutEffect(() => {
    boundsRef.current = bounds
  })
  const camera = useMemo<CameraApi>(() => {
    const size = () => {
      const el = mapBox.current
      const r = el?.getBoundingClientRect()
      return { width: r?.width ?? 0, height: r?.height ?? 0, top: el ? coveredTop(el) : 0 }
    }
    const current = (): Limits => zoomLimits(boundsRef.current, size())
    const move = (viewport: Viewport, duration = 0) => {
      const flow = flowRef.current
      if (flow) moveCamera(flow, viewport, current(), size(), duration)
    }
    return {
      limits: current,
      size,
      move,
      frame: (options = {}, duration = 0) => {
        const rects = viewRef.current ? Object.values(viewRef.current.rects) : []
        const start = options.readable ? flowStart(rects) : undefined
        move(frameViewport(current(), size(), start ? { ...options, start } : options), duration)
      },
    }
  }, [])
  const rectOf = useCallback((id: string) => viewRef.current?.rects[id], [])

  const step = useMemo(() => currentStep({ board, scenario }), [board, scenario])
  useEffect(() => {
    viewRef.current = shown
    playing.current = step !== undefined
  })
  const noteCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of notes ?? []) {
      if (n.target.type === 'component') counts.set(n.target.id, (counts.get(n.target.id) ?? 0) + 1)
    }
    return counts
  }, [notes])
  const graph = useMemo(
    () =>
      board && shown ? assembleGraph(board, shown.rects, shown.geometry, selection, step?.highlight, links ?? [], noteCounts, cache, shown.held, pushed) : undefined,
    [board, shown, selection, step, links, noteCounts, cache, pushed],
  )
  const lineCount = (board?.relationships.length ?? 0) + (links?.length ?? 0)
  const crowded = lineCount > CROWDED_LINES || (board !== undefined && lineCount > board.components.length * CROWDED_RATIO)

  // The full build comes after the drop, or after the last arrow key, and so does the save of keyboard moves.
  const settle = shown?.held === undefined ? shown?.settle : undefined
  useEffect(() => {
    if (settle === undefined) return
    const settleNow = () => {
      const current = viewRef.current
      if (!current) return
      saveKeyMoves(current)
      setView((v) => (v && v.settle !== undefined && v.held === undefined ? fullView(v.board, v.base, v.links, v.rects, v.geometry) : v))
    }
    return settle === 0 ? afterPaint(settleNow) : cancelTimer(window.setTimeout(settleNow, settle))
  }, [settle, shown, saveKeyMoves])

  // Escape while a card is held puts it back and leaves the selection and focus alone.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const held = hold.current
      if (event.key !== 'Escape' || !held) return
      event.stopPropagation()
      event.preventDefault()
      if (held.cancelled) return
      held.cancelled = true
      guides.current?.hide()
      setView((v) => (v ? { ...v, rects: held.before.rects, geometry: held.before.geometry, ...(held.before.settle === undefined ? {} : { settle: held.before.settle }) } : v))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // A keyboard move that has not been saved yet is saved when the map goes away.
  useEffect(
    () => () => {
      if (viewRef.current) saveKeyMoves(viewRef.current)
    },
    [saveKeyMoves],
  )
  const [connecting, setConnecting] = useState(false)
  const connectEndedAt = useRef(-Infinity)
  const stepKey = step ? `${step.scenario.id}:${step.index}` : undefined

  /** Picks a card up: remembers the map for Escape, and the other cards in view for the guides. */
  const pickUp = useCallback((id: string, kind: Hold['kind']) => {
    const before = viewRef.current
    if (!before) return
    const flow = flowRef.current
    const viewport = flow?.getViewport() ?? { x: 0, y: 0, zoom: 1 }
    const size = camera.size()
    const others = Object.entries(before.rects).flatMap(([other, r]) => (other === id ? [] : [r]))
    hold.current = { id, kind, before, cancelled: false, targets: new SnapTargets(inView(others, viewport, size)), reach: SNAP_PX / viewport.zoom }
    if (hoverStyle.current) hoverStyle.current.textContent = ''
    setView((v) => (v ? { ...v, held: id } : v))
  }, [camera])

  /** Lets go of the card in hand. Returns the hold, unless Escape cancelled it. */
  const letGo = useCallback((): Hold | undefined => {
    const held = hold.current
    hold.current = undefined
    guides.current?.hide()
    setView((v) => {
      if (!v) return v
      const { held: _dropped, ...rest } = v
      return rest
    })
    return held && !held.cancelled ? held : undefined
  }, [])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (!('id' in change) || change.id.startsWith('group:')) continue
        if (change.type === 'position' && change.position) {
          const { id, position } = change
          const held = hold.current
          if (held?.kind === 'resize') continue
          if (held) {
            // A drag saves once, when the card is dropped. The card lines up with its neighbors on the way.
            if (held.cancelled) continue
            const rect = viewRef.current?.rects[id]
            if (!rect) continue
            const lined = held.targets.move({ ...rect, ...position }, held.reach)
            guides.current?.show(lined.vertical, lined.horizontal)
            setView((v) => (v ? changed(v, id, { ...rect, x: Math.round(lined.x), y: Math.round(lined.y) }, 0) : v))
          } else {
            // Arrow keys move a card without a drag.
            keyMoves.current.add(id)
            setView((v) => {
              const rect = v?.rects[id]
              return v && rect ? changed(v, id, { ...rect, ...position }, KEY_SETTLE_MS) : v
            })
          }
        } else if (change.type === 'dimensions' && change.resizing !== undefined && change.dimensions) {
          const { id } = change
          if (change.resizing) {
            if (!hold.current) pickUp(id, 'resize')
            const held = hold.current
            const rect = viewRef.current?.rects[id]
            if (!held || held.cancelled || held.id !== id || !rect) continue
            const raw = {
              width: clampTo(change.dimensions.width, CARD_MIN.width, CARD_MAX.width),
              height: clampTo(change.dimensions.height, CARD_MIN.height, CARD_MAX.height),
            }
            // An edge that lines up with a neighbor wins over the 8 px grid.
            const lined = held.targets.resize({ ...rect, ...raw }, held.reach)
            const size: Size = {
              width: clampTo(lined.vertical ? Math.round(lined.width) : snap(raw.width), CARD_MIN.width, CARD_MAX.width),
              height: clampTo(lined.horizontal ? Math.round(lined.height) : snap(raw.height), CARD_MIN.height, CARD_MAX.height),
            }
            guides.current?.show(lined.vertical, lined.horizontal)
            setView((v) => (v ? changed(v, id, { ...rect, ...size }, 0) : v))
          } else if (hold.current?.kind === 'resize') {
            const held = letGo()
            const current = viewRef.current
            const rect = current?.rects[id]
            if (!held || !current || !rect) continue
            const aside = pushAside(current, [id], held.before)
            dispatch({ type: 'cardResized', id, size: { width: rect.width, height: rect.height }, positions: aside })
            showPushed(Object.keys(aside))
          }
        } else if (change.type === 'select' && change.selected) {
          // While a walkthrough plays, picking up a card must not change what the panel shows. A click still does.
          if (playing.current) continue
          pickedOnMap.current = change.id
          dispatch({ type: 'select', selection: { type: 'component', id: change.id } })
        }
      }
    },
    [dispatch, pickUp, letGo, showPushed],
  )

  const onDragStart = useCallback((_: unknown, node: { id: string }) => pickUp(node.id, 'drag'), [pickUp])

  const onDragStop = useCallback(
    (_: unknown, node: { id: string }) => {
      const held = letGo()
      const current = viewRef.current
      // React Flow's own position has no snapping, so the drop is read from the map.
      const rect = current?.rects[node.id]
      if (!held || !current || !rect) return
      keyMoves.current.delete(node.id)
      const aside = pushAside(current, [node.id], held.before)
      dispatch({ type: 'cardsMoved', positions: { ...aside, [node.id]: { x: rect.x, y: rect.y } } })
      showPushed(Object.keys(aside))
      // The card is not held back while it moves. After the drop, a card that landed out of sight is brought back.
      const flow = flowRef.current
      const next = flow ? viewportShowing(flow.getViewport(), camera.size(), rect) : undefined
      if (next) camera.move(next, prefersStillness() ? 0 : DROP_PAN_MS)
    },
    [dispatch, letGo, showPushed, camera],
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

  // The card under the pointer brings its own lines forward and lets the rest step back. One style rule, no render.
  const onNodeMouseEnter = useCallback((_: unknown, node: { id: string }) => {
    const style = hoverStyle.current
    if (!style || hold.current || node.id.startsWith('group:')) return
    const id = CSS.escape(node.id)
    style.textContent = `[data-hover-scope] [data-ends]:not([data-ends~="${id}"]) { opacity: 0.22; }
[data-hover-scope] [data-ends~="${id}"] { opacity: 1; --line-ink: var(--fg-2); }
[data-hover-scope][data-labels="quiet"] [data-label][data-ends~="${id}"] { visibility: visible !important; }`
  }, [])
  const onNodeMouseLeave = useCallback(() => {
    if (hoverStyle.current) hoverStyle.current.textContent = ''
  }, [])

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

  const addLink = useCallback(
    (from: string, to: string) => {
      const id = newId('link')
      dispatch({ type: 'linkAdded', from, to, label: '', id, now: new Date() })
      dispatch({ type: 'select', selection: { type: 'link', id } })
      toast('Link added')
    },
    [dispatch],
  )

  // Dragging from one card's handle to another draws a link. It is always the user's own annotation.
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) return
      addLink(connection.source, connection.target)
    },
    [addLink],
  )

  // A line dropped anywhere on another card joins the two, not only one dropped on a dot.
  // A drop on empty space, or back on the first card, does nothing, and the click that follows keeps the selection.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      setConnecting(false)
      connectEndedAt.current = performance.now()
      if (state.isValid) return
      const from = state.fromNode?.id
      if (!from) return
      const point = 'changedTouches' in event ? event.changedTouches[0] : event
      if (!point) return
      const target = cardUnder(point.clientX, point.clientY)
      if (target && target !== from) addLink(from, target)
    },
    [addLink],
  )

  const onPaneClick = useCallback(() => {
    if (performance.now() - connectEndedAt.current < PANE_CLICK_GUARD_MS) return
    dispatch({ type: 'select', selection: { type: 'board' } })
  }, [dispatch])

  if (!board || !graph) return null

  return (
    <div ref={mapBox} className={styles.canvas} data-connecting={connecting || undefined} data-labels={quiet ? 'quiet' : undefined} data-hover-scope="">
      <style ref={hoverStyle} />
      <CameraContext.Provider value={camera}>
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
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          autoPanOnNodeDrag={false}
          panOnScroll
          panOnScrollSpeed={0.8}
          zoomOnScroll={false}
          zoomOnPinch
          onPaneClick={onPaneClick}
          minZoom={limits.minZoom}
          maxZoom={MAX_ZOOM}
          translateExtent={limits.extent}
          nodesConnectable
          connectionMode={ConnectionMode.Loose}
          onConnect={onConnect}
          onConnectStart={() => setConnecting(true)}
          onConnectEnd={onConnectEnd}
          edgesFocusable
          nodesFocusable
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          zoomOnDoubleClick={false}
          ariaLabelConfig={ARIA_LABELS}
          proOptions={{ hideAttribution: true }}
          aria-label="Map of the board"
        >
          <FlowHandle onFlow={setFlow} />
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} className={styles.dots ?? ''} />
          <KeepSelectionInView takePicked={takePicked} rectOf={rectOf} />
          <Camera stepKey={stepKey} focus={step?.focusParts ?? []} dragging={shown?.held !== undefined} rectOf={rectOf} />
          <KeepInLimits limits={limits} />
          <LabelMode crowded={crowded} onChange={setQuiet} />
          <SnapGuides ref={guides} />
          <ZoomBar />
          <WheelZoom />
          <MapHint />
        </ReactFlow>
      </CameraContext.Provider>
    </div>
  )
}

/** Hands the map's instance to the canvas before any effect of the map runs, so the first camera move has it. */
function FlowHandle({ onFlow }: { onFlow: (flow: ReactFlowInstance) => void }) {
  const flow = useReactFlow()
  useLayoutEffect(() => onFlow(flow), [flow, onFlow])
  return null
}

/** The click that ends a connection drag arrives within a frame or two of the drop. */
const PANE_CLICK_GUARD_MS = 150

/** The part card under a screen point. Group areas do not count. */
function cardUnder(x: number, y: number): string | undefined {
  for (const el of document.elementsFromPoint(x, y)) {
    const node = el.closest<HTMLElement>('.react-flow__node')
    if (!node || node.classList.contains('react-flow__node-group-area')) continue
    return node.dataset.id
  }
  return undefined
}

function cancelTimer(id: number): () => void {
  return () => window.clearTimeout(id)
}
