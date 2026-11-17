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
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { currentStep } from '../scenarios/step'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useAppDispatch, useAppStore, useAppStoreApi } from '../app/store'
import { useUi, useUiApi } from '../app/ui'
import { editsText } from '../commands/keys'
import { CARD_MAX, CARD_MIN, CARD_SIZE, CARD_WIDTH, groupAreas, placeCards, snap, type CardPlacement } from '../layout/cards'
import type { Point, Rect, Size } from '../layout/geometry'
import { settleMoves } from '../layout/groups'
import { newId } from '../layer/edits'
import type { Board } from '../board/schema'
import type { Link, Mark, MarkEnd, Proposal, Reconnect } from '../layer/model'
import { DrawSurface, ATTACH_PX, type Drawn } from '../whiteboard/DrawSurface'
import { Editor, type Typed } from '../whiteboard/Editor'
import { EndHandles, type EndHandle } from '../whiteboard/EndHandles'
import { partUnder } from '../whiteboard/pointer'
import { endDropAction, type Drop, type EndRef } from '../whiteboard/endDrop'
import { arrowEnds, attachAt, pointAlong, translateMark, type Scene } from '../whiteboard/geometry'
import { InkLayer } from '../whiteboard/InkLayer'
import { ProposalNode, StickyNode, TextNode } from '../whiteboard/nodes'
import { STICKY_MAX, STICKY_MIN, STICKY_SIZE } from '../whiteboard/sizes'
import { Toolbar } from '../whiteboard/Toolbar'
import { isDrawing, mapProps, ONE_USE_TOOLS } from '../whiteboard/tools'
import { heldId as heldOf, IDLE, isBusy, isHolding, next, pendingMoves, reusesLines, type Event, type Interaction } from './interaction'
import { onTextMeasured } from './textMeasure'
import { assembleGraph, computeGeometry, editedId, geometrySteps, GraphCache, MANUAL_PREFIX, MARK_PREFIX, moveCard, type Geometry, type UserParts } from './buildGraph'
import { contentBounds, coveredTop, frameViewport, MAX_ZOOM, OPEN_FIT_PARTS, type Frame, moveCamera, stepZoom, viewportShowing, zoomAround, zoomLimits, type Limits } from './camera'
import { CameraContext, CameraSlotContext, GLIDE_MS, prefersStillness, type Camera as CameraApi } from './cameraContext'
import { Camera, KeepInLimits, KeepSelectionInView, LabelMode, LabelScale, WheelZoom } from './CameraControls'
import { CardNode } from './CardNode'
import styles from './Canvas.module.css'
import { GroupNode } from './GroupNode'
import { MapHint } from './MapHint'
import { ManualEdge } from './ManualEdge'
import { RelationshipEdge } from './RelationshipEdge'
import { inView, SNAP_PX, SnapTargets } from './snap'
import { SnapGuides, type GuideLines } from './SnapGuides'
import { stepBackRules } from './emphasis'
import { ZoomBar } from './ZoomBar'

const nodeTypes: NodeTypes = { card: CardNode, 'group-area': GroupNode, proposal: ProposalNode, 'mark-text': TextNode, 'mark-sticky': StickyNode }
const edgeTypes: EdgeTypes = { relationship: RelationshipEdge, 'manual-link': ManualEdge }
const ARIA_LABELS = {
  'node.a11yDescription.keyboardDisabled': 'Press Enter to select this part. Then use the arrow keys to move it. Press Escape to go back to the overview.',
  'node.a11yDescription.default': 'Press Enter to select this part. Press Escape to go back to the overview.',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }: { direction: string; x: number; y: number }) =>
    `Moved ${direction}. Position ${x}, ${y}.`,
  'edge.a11yDescription.default': 'Press Enter to select this connection. Press Escape to go back to the overview.',
}

/** The map as it is drawn now. While a card moves, its lines are hidden. A full build follows the drop. */
interface View {
  board: Board
  links: readonly Link[] | undefined
  proposals: readonly Proposal[] | undefined
  reconnects: readonly Reconnect[] | undefined
  /** The stored positions and sizes this view was built from. */
  base: CardPlacement | undefined
  rects: Record<string, Rect>
  geometry: Geometry
  /** What the map is doing: a card in hand, lines waiting for the full build, the build, a font refresh owed. */
  interaction: Interaction
}

const NO_PLACEMENT: CardPlacement = { positions: {}, sizes: {} }

/** Where every card is: the board's parts as laid out, and the parts the user proposed, where the user put them. */
function placeAll(board: Board, base: CardPlacement | undefined, proposals: readonly Proposal[] | undefined): Record<string, Rect> {
  const rects = placeCards(board, base ?? NO_PLACEMENT)
  for (const p of proposals ?? []) rects[p.id] = { x: p.x, y: p.y, width: p.width, height: p.height }
  return rects
}

interface UserLines {
  links: readonly Link[] | undefined
  proposals: readonly Proposal[] | undefined
  reconnects: readonly Reconnect[] | undefined
}

/** A build with no previous geometry, from the cards where they are now: nothing in motion or unsaved moves. */
const rebuildFromRects = (v: View): View => fullView(v.board, v.base, v, v.rects, undefined, next(v.interaction, { type: 'rebuilt' }))

/** The last solve. React may render the same change twice, and the second render must not solve again. */
let lastSolve: { board: Board; links: UserLines['links']; reconnects: UserLines['reconnects']; previous: Geometry | undefined; rects: Record<string, Rect>; geometry: Geometry } | undefined

export function solve(board: Board, rects: Record<string, Rect>, links: UserLines['links'], previous: Geometry | undefined, reconnects: UserLines['reconnects']): Geometry {
  // Only a solve that builds on a previous one is repeated by React. A solve from scratch, such as the one after the fonts
  // load, is never taken from the last one, because the text sizes may have changed since.
  const last = previous ? lastSolve : undefined
  if (last && last.board === board && last.links === links && last.reconnects === reconnects && last.previous === previous && sameRects(last.rects, rects)) return last.geometry
  const geometry = computeGeometry(board, rects, links ?? [], previous, reconnects ?? [])
  lastSolve = { board, links, reconnects, previous, rects, geometry }
  return geometry
}

/** `previous` is the map of the same board and links. Lines that nothing has moved into keep their place. */
function fullView(board: Board, base: CardPlacement | undefined, user: UserLines, rects = placeAll(board, base, user.proposals), previous?: Geometry, interaction: Interaction = IDLE): View {
  const { links, proposals, reconnects } = user
  return { board, links, proposals, reconnects, base, rects, geometry: solve(board, rects, links, previous, reconnects), interaction }
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

/** The cheap update for one card that moved or changed size: its lines are hidden and its group area follows. */
function changed(view: View, id: string, rect: Rect, event: Event): View {
  const at = view.rects[id]
  if (!at || (at.x === rect.x && at.y === rect.y && at.width === rect.width && at.height === rect.height)) return view
  if (view.interaction.held?.cancelled) return view
  const rects = { ...view.rects, [id]: rect }
  return { ...view, rects, geometry: moveCard(view.board, view.geometry, rects, id), interaction: next(view.interaction, event) }
}

/** Only cards that were already there moved or changed size, and nothing else about the lines changed. */
function movedOnly(view: View, rects: Record<string, Rect>, reconnects: View['reconnects']): boolean {
  if (view.interaction.stale || reconnects !== view.reconnects) return false
  const ids = Object.keys(rects)
  return ids.length === Object.keys(view.rects).length && ids.every((id) => view.rects[id] !== undefined)
}

/**
 * A resize or a drop that pushes other cards aside lands on the cheap path of a drag: the lines of every card that
 * changed are hidden, and the full build, which keeps the lines nothing touched, follows after the next paint.
 */
function settling(view: View, base: CardPlacement | undefined, proposals: View['proposals'], rects: Record<string, Rect>): View {
  let geometry = view.geometry
  for (const [id, rect] of Object.entries(rects)) {
    const was = view.rects[id]
    if (was && was.x === rect.x && was.y === rect.y && was.width === rect.width && was.height === rect.height) continue
    geometry = moveCard(view.board, geometry, rects, id)
  }
  return { ...view, base, proposals, rects, geometry, interaction: next(view.interaction, { type: 'external', change: 'moved' }) }
}

/** How long one frame may spend on the build that follows a drop or a resize. */
const SLICE_MS = 8

/**
 * Solves the lines in slices, one per frame, so no frame holds the whole build. Returns what cancels it.
 * The result is the same as `computeGeometry` gives.
 */
function solveInSlices(view: View, reuse: boolean, done: (geometry: Geometry) => void): () => void {
  const steps = geometrySteps(view.board, view.rects, view.links ?? [], reuse ? view.geometry : undefined, view.reconnects ?? [])
  let frame = 0
  const run = () => {
    const start = performance.now()
    for (;;) {
      const step = steps.next()
      if (step.done) return done(step.value)
      if (performance.now() - start > SLICE_MS) break
    }
    frame = window.requestAnimationFrame(run)
  }
  frame = window.requestAnimationFrame(run)
  return () => window.cancelAnimationFrame(frame)
}

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
  /** Set synchronously by Escape. The pointer may still be down, and its moves are ignored until the release. */
  cancelled: boolean
  /** The edges and middles of the other cards in view, for the alignment guides. */
  targets: SnapTargets
  /** Snapping reach in board pixels at the zoom of the moment. */
  reach: number
}

/**
 * Moves the cards that a dropped or resized card covers out of its way, then moves the groups apart so that no two group
 * areas overlap.
 */
function pushAside(view: View, ids: readonly string[]): Record<string, Point> {
  return settleMoves(view.board, view.rects, ids)
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
  const { board, positions, sizes, links, notes, marks, proposals, reconnects, selection, scenario } = useAppStore(
    useShallow((s) => ({
      board: s.board,
      positions: s.layer?.positions,
      sizes: s.layer?.sizes,
      links: s.layer?.links,
      notes: s.layer?.notes,
      marks: s.layer?.marks,
      proposals: s.layer?.proposals,
      reconnects: s.layer?.reconnects,
      selection: s.selection,
      scenario: s.scenario,
    })),
  )
  const stored = useMemo(() => (positions && sizes ? { positions, sizes } : undefined), [positions, sizes])
  const dispatch = useAppDispatch()
  const store = useAppStoreApi()
  const uiApi = useUiApi()
  const chosenTool = useUi((u) => u.tool)
  const spaceHand = useUi((u) => u.spaceHand)
  const editing = useUi((u) => u.editing)
  const tool = spaceHand ? 'hand' : chosenTool
  const [view, setView] = useState<View | undefined>(() => (board ? fullView(board, stored, { links, proposals, reconnects }) : undefined))
  // The map is rebuilt in full when the board or the links change. When positions, sizes, proposed parts, or moved
  // connection ends change from outside the map, only the lines that changed are solved again.
  let shown = view
  if (board && (!view || view.board !== board || view.links !== links)) {
    shown = fullView(board, stored, { links, proposals, reconnects })
    setView(shown)
  } else if (view && (stored !== view.base || proposals !== view.proposals || reconnects !== view.reconnects)) {
    const rects = placeAll(view.board, stored, proposals)
    const user = { links: view.links, proposals, reconnects }
    shown =
      sameRects(rects, view.rects) && reconnects === view.reconnects
        ? { ...view, base: stored, proposals, interaction: next(view.interaction, { type: 'external', change: 'same' }) }
        : movedOnly(view, rects, reconnects)
          ? settling(view, stored, proposals, rects)
          : fullView(view.board, stored, user, rects, reusesLines(view.interaction) ? view.geometry : undefined, next(view.interaction, { type: 'rebuilt' }))
    setView(shown)
  }
  // Text measured before its font faces loaded was sized with the fallback. When they are in, the map is built again, once.
  const interaction = shown?.interaction
  useEffect(
    () =>
      onTextMeasured(() => setView((v) => (v ? (isBusy(v.interaction) ? { ...v, interaction: next(v.interaction, { type: 'fontsLoaded' }) } : rebuildFromRects(v)) : v))),
    [],
  )
  useEffect(() => {
    if (interaction?.stale && !isBusy(interaction)) {
      return afterPaint(() => setView((v) => (v && v.interaction.stale && !isBusy(v.interaction) ? rebuildFromRects(v) : v)))
    }
  }, [interaction])
  const viewRef = useRef(shown)
  const hold = useRef<Hold | undefined>(undefined)
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
      for (const id of pendingMoves(current.interaction)) {
        const rect = current.rects[id]
        if (rect) moves[id] = { x: rect.x, y: rect.y }
      }
      if (Object.keys(moves).length === 0) return
      const aside = pushAside(current, Object.keys(moves))
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
  // The opening view frames the parts. A mark drawn far from them does not pull it off the board.
  const partsBounds = useMemo(
    () => (board && solved ? contentBounds(Object.values(solved), Object.values(groupAreas(board, solved)), [], proposals) : undefined),
    [board, solved, proposals],
  )
  const limits = useMemo(() => zoomLimits(bounds, mapSize), [bounds, mapSize])
  const boundsRef = useRef(bounds)
  const partsBoundsRef = useRef(partsBounds)
  const partCount = board?.components.length ?? 0
  const partCountRef = useRef(partCount)
  useLayoutEffect(() => {
    boundsRef.current = bounds
    partsBoundsRef.current = partsBounds
    partCountRef.current = partCount
  })
  // What arrow ends attach to, as drawn now. Filled in below, once the map is built.
  const sceneRef = useRef<Scene>({ rects: {}, lines: new Map() })
  const camera = useMemo<CameraApi>(() => {
    const size = () => {
      const el = mapBox.current
      const r = el?.getBoundingClientRect()
      return { width: r?.width ?? 0, height: r?.height ?? 0, top: el ? coveredTop(el) : 0 }
    }
    const current = (): Limits => zoomLimits(boundsRef.current, size())
    const move = (viewport: Viewport, duration = 0) => {
      const flow = flowRef.current
      return flow ? moveCamera(flow, viewport, current(), size(), duration) : viewport
    }
    const frame: CameraApi['frame'] = (options = {}, duration = 0) => {
      const rects = viewRef.current ? Object.values(viewRef.current.rects) : []
      if (!options.readable) return move(frameViewport(current(), size(), options), duration)
      const start = flowStart(rects)
      const box = partsBoundsRef.current
      const framed: Frame = { ...options, fitAll: partCountRef.current > OPEN_FIT_PARTS, ...(start ? { start } : {}), ...(box ? { box } : {}) }
      return move(frameViewport(current(), size(), framed), duration)
    }
    // Where a glide is going. A second step during the glide goes on from there, not from halfway.
    const glide: { heading?: { viewport: Viewport; until: number } | undefined } = {}
    const now = (): Viewport => {
      const flow = flowRef.current
      const heading = glide.heading
      return heading && performance.now() < heading.until ? heading.viewport : (flow?.getViewport() ?? { x: 0, y: 0, zoom: 1 })
    }
    const zoom: CameraApi['zoom'] = (command, animate = false) => {
      const duration = animate && !prefersStillness() ? GLIDE_MS : 0
      const box = size()
      const middle = { x: box.width / 2, y: box.top + (box.height - box.top) / 2 }
      const limits = current()
      const step = stepZoom(now().zoom, command === 'in' ? 1 : -1, limits)
      let viewport: Viewport
      // Zoomed all the way out, the whole board is in view, wherever the view was before.
      if (command === 'fit' || (command === 'out' && step <= limits.minZoom + 1e-6)) viewport = frame({}, duration)
      else viewport = move(zoomAround(now(), command === 'reset' ? 1 : step, middle), duration)
      glide.heading = duration > 0 ? { viewport, until: performance.now() + duration } : undefined
    }
    return {
      limits: current,
      size,
      move,
      frame,
      zoom,
      rectOf: (id: string) => viewRef.current?.rects[id],
      scene: () => sceneRef.current,
    }
  }, [])
  const slot = useContext(CameraSlotContext)
  useEffect(() => {
    slot.set(camera)
    return () => {
      if (slot.get() === camera) slot.set(undefined)
    }
  }, [slot, camera])
  const rectOf = camera.rectOf

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
  /** A text or sticky note being dragged or resized, until it is dropped. */
  const [moving, setMoving] = useState<UserParts['moving']>(undefined)
  const movingRef = useRef(moving)
  useLayoutEffect(() => {
    movingRef.current = moving
  })
  const user = useMemo<UserParts>(
    () => ({ proposals: proposals ?? [], reconnects: reconnects ?? [], marks: marks ?? [], moving, editing: editing?.id }),
    [proposals, reconnects, marks, moving, editing],
  )
  const held = interaction && heldOf(interaction)
  const rectsNow = shown?.rects
  const geometryNow = shown?.geometry
  const graph = useMemo(
    () =>
      board && rectsNow && geometryNow
        ? assembleGraph(board, rectsNow, geometryNow, selection, step?.highlight, links ?? [], noteCounts, cache, held, pushed, user)
        : undefined,
    [board, rectsNow, geometryNow, held, selection, step, links, noteCounts, cache, pushed, user],
  )

  // What arrow ends attach to: every card, and every connection's drawn line, where the user's moved line wins.
  const scene = useMemo<Scene>(() => {
    const lines = new Map<string, readonly Point[]>()
    for (const r of board?.relationships ?? []) {
      const shape = geometryNow?.edges.get(editedId(r.id)) ?? geometryNow?.edges.get(r.id)
      if (shape) lines.set(r.id, shape.points)
    }
    return { rects: rectsNow ?? {}, lines }
  }, [board, rectsNow, geometryNow])
  useLayoutEffect(() => {
    sceneRef.current = scene
  })
  // Arrows attached to the card in hand, or to a connection that is hidden with it, wait for the drop too.
  const hiddenArrows = useMemo(() => {
    const out = new Set<string>()
    if (!geometryNow) return out
    const hiddenLines = new Set<string>()
    for (const r of board?.relationships ?? []) {
      if (geometryNow.edges.get(r.id)?.cheap || geometryNow.edges.get(editedId(r.id))?.cheap) hiddenLines.add(r.id)
    }
    if (held === undefined && hiddenLines.size === 0) return out
    const attached = (end: MarkEnd) =>
      (end.type === 'part' && end.id === held) || (end.type === 'relationship' && hiddenLines.has(end.id))
    for (const m of marks ?? []) if (m.kind === 'arrow' && (attached(m.from) || attached(m.to))) out.add(m.id)
    return out
  }, [geometryNow, held, board, marks])
  const getScene = useCallback(() => sceneRef.current, [])
  const lineCount = (board?.relationships.length ?? 0) + (links?.length ?? 0)
  const crowded = lineCount > CROWDED_LINES || (board !== undefined && lineCount > board.components.length * CROWDED_RATIO)

  // The full build comes after the drop, or after the last arrow key, and so does the save of keyboard moves.
  const waiting = interaction && !isHolding(interaction) && interaction.work.mode === 'settling' ? interaction.work.wait : undefined
  useEffect(() => {
    if (waiting === undefined) return
    const due = () => {
      const current = viewRef.current
      if (!current || current.interaction.work.mode !== 'settling' || isHolding(current.interaction)) return
      saveKeyMoves(current)
      // The ref moves on at once, so a second timer or the unmount save never sees these moves again.
      viewRef.current = { ...current, interaction: next(current.interaction, { type: 'settleDue' }) }
      setView((v) => (v ? { ...v, interaction: next(v.interaction, { type: 'settleDue' }) } : v))
    }
    return waiting === 0 ? afterPaint(due) : cancelTimer(window.setTimeout(due, waiting))
  }, [interaction, waiting, saveKeyMoves])
  // The lines stay hidden while the build runs. A card picked up meanwhile, or any other change, cancels it.
  const solving = interaction !== undefined && !isHolding(interaction) && interaction.work.mode === 'solving'
  useEffect(() => {
    const current = viewRef.current
    if (!solving || !current) return
    return solveInSlices(current, reusesLines(current.interaction), (geometry) =>
      setView((v) => {
        if (!v || v.rects !== current.rects || v.geometry !== current.geometry) return v
        const interaction = next(v.interaction, { type: 'solved' })
        return interaction === v.interaction ? v : { ...v, geometry, interaction }
      }),
    )
  }, [interaction, solving])

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
      setView((v) => (v && isHolding(v.interaction) ? { ...v, rects: held.before.rects, geometry: held.before.geometry, interaction: next(v.interaction, { type: 'escape' }) } : v))
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
  // A walkthrough shows the map as it is. Tools come back to Select when one starts.
  useEffect(() => {
    if (step && chosenTool !== 'select') uiApi.setTool('select')
  }, [step, chosenTool, uiApi])

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
    setView((v) => (v ? { ...v, interaction: next(v.interaction, { type: 'pickUp', id, kind }) } : v))
  }, [camera])

  /** Lets go of the card in hand. Returns the hold, unless Escape cancelled it. */
  const letGo = useCallback((): Hold | undefined => {
    const held = hold.current
    hold.current = undefined
    guides.current?.hide()
    setView((v) => (v ? { ...v, interaction: next(v.interaction, { type: 'release' }) } : v))
    return held && !held.cancelled ? held : undefined
  }, [])

  /** Text and sticky notes move and resize on their own: no lines, no guides, no push. One change on drop. */
  const markNodeChange = useCallback(
    (change: NodeChange) => {
      if (!('id' in change)) return
      const id = change.id.slice(MARK_PREFIX.length)
      const mark = store.getState().layer?.marks.find((m) => m.id === id)
      if (!mark || (mark.kind !== 'text' && mark.kind !== 'sticky')) return
      if (change.type === 'select' && change.selected) {
        if (!playing.current) dispatch({ type: 'select', selection: { type: 'mark', id } })
      } else if (change.type === 'position' && change.position && change.dragging) {
        const { x, y } = change.position
        setMoving((m) => ({ ...(m?.id === id ? m : {}), id, x: Math.round(x), y: Math.round(y) }))
      } else if (change.type === 'dimensions' && change.dimensions && change.resizing !== undefined) {
        if (change.resizing) {
          const width = clampTo(Math.round(change.dimensions.width), STICKY_MIN.width, STICKY_MAX.width)
          const height = clampTo(Math.round(change.dimensions.height), STICKY_MIN.height, STICKY_MAX.height)
          setMoving((m) => ({ ...(m?.id === id ? m : { x: mark.x, y: mark.y }), id, width, height }))
        } else {
          const done = movingRef.current
          setMoving(undefined)
          if (done?.id === id && done.width !== undefined && done.height !== undefined) {
            dispatch({ type: 'markChanged', id, mark: { ...mark, x: done.x, y: done.y, width: done.width, height: done.height } })
          }
        }
      }
    },
    [dispatch, store],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (!('id' in change) || change.id.startsWith('group:')) continue
        if (change.id.startsWith(MARK_PREFIX)) {
          markNodeChange(change)
          continue
        }
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
            setView((v) => (v ? changed(v, id, { ...rect, x: Math.round(lined.x), y: Math.round(lined.y) }, { type: 'move' }) : v))
          } else {
            setView((v) => {
              const rect = v?.rects[id]
              return v && rect ? changed(v, id, { ...rect, ...position }, { type: 'keyMove', id }) : v
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
            setView((v) => (v ? changed(v, id, { ...rect, ...size }, { type: 'move' }) : v))
          } else if (hold.current?.kind === 'resize') {
            const held = letGo()
            const current = viewRef.current
            const rect = current?.rects[id]
            if (!held || !current || !rect) continue
            const aside = pushAside(current, [id])
            dispatch({ type: 'cardResized', id, size: { width: rect.width, height: rect.height }, positions: aside })
            showPushed(Object.keys(aside))
          }
        } else if (change.type === 'select' && change.selected) {
          // While a walkthrough plays, picking up a card must not change what the panel shows. A click still does.
          if (playing.current) continue
          pickedOnMap.current = change.id
          const proposal = store.getState().layer?.proposals.some((p) => p.id === change.id)
          dispatch({ type: 'select', selection: { type: proposal ? 'proposal' : 'component', id: change.id } })
        }
      }
    },
    [dispatch, pickUp, letGo, showPushed, store, markNodeChange],
  )

  const onDragStart = useCallback((_: unknown, node: { id: string }) => {
    if (!node.id.startsWith(MARK_PREFIX)) pickUp(node.id, 'drag')
  }, [pickUp])

  const onDragStop = useCallback(
    (_: unknown, node: { id: string }) => {
      if (node.id.startsWith(MARK_PREFIX)) {
        const done = movingRef.current
        setMoving(undefined)
        const id = node.id.slice(MARK_PREFIX.length)
        const mark = store.getState().layer?.marks.find((m) => m.id === id)
        if (done?.id === id && mark) dispatch({ type: 'markChanged', id, mark: translateMark(mark, done.x - (mark.kind === 'stroke' || mark.kind === 'arrow' ? 0 : mark.x), done.y - (mark.kind === 'stroke' || mark.kind === 'arrow' ? 0 : mark.y)) })
        return
      }
      const held = letGo()
      const current = viewRef.current
      // React Flow's own position has no snapping, so the drop is read from the map.
      const rect = current?.rects[node.id]
      if (!held || !current || !rect) return
      const aside = pushAside(current, [node.id])
      dispatch({ type: 'cardsMoved', positions: { ...aside, [node.id]: { x: rect.x, y: rect.y } } })
      showPushed(Object.keys(aside))
      // The card is not held back while it moves. After the drop, a card that landed out of sight is brought back.
      const flow = flowRef.current
      const next = flow ? viewportShowing(flow.getViewport(), camera.size(), rect) : undefined
      if (next) camera.move(next, prefersStillness() ? 0 : DROP_PAN_MS)
    },
    [dispatch, letGo, showPushed, camera, store],
  )

  // During a walkthrough a click on a part still opens it. Picking a part up does not.
  const onNodeClick = useCallback(
    (_: unknown, node: { id: string }) => {
      if (!playing.current || node.id.startsWith('group:') || node.id.startsWith(MARK_PREFIX)) return
      pickedOnMap.current = node.id
      const proposal = store.getState().layer?.proposals.some((p) => p.id === node.id)
      dispatch({ type: 'select', selection: { type: proposal ? 'proposal' : 'component', id: node.id } })
    },
    [dispatch, store],
  )

  // A double click on text, a sticky note, or a proposed part types in place.
  const onNodeDoubleClick = useCallback(
    (_: unknown, node: { id: string }) => {
      if (playing.current) return
      const layer = store.getState().layer
      if (node.id.startsWith(MARK_PREFIX)) {
        const mark = layer?.marks.find((m) => m.id === node.id.slice(MARK_PREFIX.length))
        if (mark && (mark.kind === 'text' || mark.kind === 'sticky')) uiApi.setEditing({ kind: mark.kind, id: mark.id, x: mark.x, y: mark.y })
        return
      }
      const proposal = layer?.proposals.find((p) => p.id === node.id)
      if (proposal) uiApi.setEditing({ kind: 'part', id: proposal.id, x: proposal.x, y: proposal.y })
    },
    [store, uiApi],
  )

  // The card under the pointer brings its own lines forward and lets the rest step back. One style rule, no render.
  const onNodeMouseEnter = useCallback((_: unknown, node: { id: string }) => {
    const style = hoverStyle.current
    if (!style || hold.current || node.id.startsWith('group:')) return
    const id = CSS.escape(node.id)
    style.textContent = `${stepBackRules(`[data-ends~="${id}"]`)}
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
      const target = partUnder(point.clientX, point.clientY)
      if (target && target !== from) addLink(from, target)
    },
    [addLink],
  )

  /** Something drawn: a line, a shape, or an arrow is saved at once; a click with a text tool starts typing there. */
  const onDrawn = useCallback(
    (drawn: Drawn) => {
      const used = uiApi.store.getState().tool
      if (drawn.mark) {
        const id = newId('mark')
        dispatch({ type: 'markAdded', mark: { ...drawn.mark, id, createdAt: new Date().toISOString() } as Mark })
        if (used !== 'pen') dispatch({ type: 'select', selection: { type: 'mark', id } })
      } else if (drawn.place) {
        const kind = used === 'text' ? 'text' : used === 'sticky' ? 'sticky' : 'part'
        const size = kind === 'sticky' ? STICKY_SIZE : kind === 'part' ? CARD_SIZE : undefined
        // A sticky note or a part is centered on the click. Text starts where the caret would be.
        const x = Math.round(size ? drawn.place.x - size.width / 2 : drawn.place.x - 4)
        const y = Math.round(size ? drawn.place.y - size.height / 2 : drawn.place.y - 11)
        uiApi.setEditing({ kind, x, y })
      }
      if (ONE_USE_TOOLS.has(used)) uiApi.setTool('select')
    },
    [dispatch, uiApi],
  )

  /** What was typed in place is saved as one change. Nothing typed into a new one leaves nothing behind. */
  const onTyped = useCallback(
    (typed: Typed) => {
      const at = uiApi.store.getState().editing
      uiApi.setEditing(undefined)
      const layer = store.getState().layer
      if (!at || !layer) return
      const now = new Date().toISOString()
      if (at.kind === 'part') {
        const label = typed.label.trim()
        const summary = typed.summary.trim()
        if (at.id) {
          dispatch({ type: 'proposalChanged', id: at.id, change: { ...(label ? { label } : {}), summary } })
        } else if (label) {
          const id = newId('part')
          dispatch({ type: 'proposalAdded', proposal: { id, label, summary, x: at.x, y: at.y, ...CARD_SIZE, createdAt: now } })
          dispatch({ type: 'select', selection: { type: 'proposal', id } })
        }
        return
      }
      const text = typed.text.trim()
      const existing = at.id ? layer.marks.find((m) => m.id === at.id) : undefined
      if (existing && (existing.kind === 'text' || existing.kind === 'sticky')) {
        if (existing.kind === 'text' && !text) dispatch({ type: 'markDeleted', id: existing.id })
        else if (text !== existing.text) dispatch({ type: 'markChanged', id: existing.id, mark: { ...existing, text, ...(existing.kind === 'text' && typed.size ? typed.size : {}) } })
        return
      }
      if (!text) return
      const id = newId('mark')
      const box = at.kind === 'sticky' ? STICKY_SIZE : (typed.size ?? { width: 120, height: 26 })
      dispatch({ type: 'markAdded', mark: { id, createdAt: now, kind: at.kind, x: at.x, y: at.y, width: box.width, height: box.height, text } })
      dispatch({ type: 'select', selection: { type: 'mark', id } })
    },
    [dispatch, store, uiApi],
  )

  const onInkSelect = useCallback((id: string) => dispatch({ type: 'select', selection: { type: 'mark', id } }), [dispatch])
  const onInkMoved = useCallback((id: string, mark: Mark) => dispatch({ type: 'markChanged', id, mark }), [dispatch])

  /** A dragged end, let go: a connection or link end moves to another part, an arrow end attaches where it lands. */
  const onEndDrop = useCallback(
    (ref: EndRef, drop: Drop) => {
      const { board: b, layer } = store.getState()
      const zoom = flowRef.current?.getViewport().zoom ?? 1
      if (!b || !layer) return
      const action = endDropAction(ref, drop, { board: b, layer, scene: sceneRef.current, reach: ATTACH_PX / zoom }, { id: newId('edit'), now: new Date() })
      if (action) dispatch(action)
    },
    [dispatch, store],
  )
  /** An arrow end snaps onto the connection it would attach to while it is dragged. */
  const endTip = useCallback((ref: EndRef, at: Point, part: string | undefined): Point => {
    if (ref.kind !== 'arrow' || part !== undefined) return at
    const zoom = flowRef.current?.getViewport().zoom ?? 1
    const end = attachAt(at, sceneRef.current, ATTACH_PX / zoom)
    if (end.type !== 'relationship') return at
    const line = sceneRef.current.lines.get(end.id)
    return (line && pointAlong(line, end.t ?? 0.5)) ?? at
  }, [])

  const onPaneClick = useCallback(() => {
    if (performance.now() - connectEndedAt.current < PANE_CLICK_GUARD_MS) return
    dispatch({ type: 'select', selection: { type: 'board' } })
  }, [dispatch])

  const handles = useMemo<EndHandle[]>(() => {
    if (tool !== 'select' || !selection || !geometryNow || step) return []
    const pair = (kind: EndRef['kind'], id: string, a: Point | undefined, b: Point | undefined): EndHandle[] =>
      a && b
        ? [
            { ref: { kind, id, end: 'from' }, at: a, fixed: b },
            { ref: { kind, id, end: 'to' }, at: b, fixed: a },
          ]
        : []
    if (selection.type === 'relationship' || selection.type === 'link') {
      const key = selection.type === 'link' ? `${MANUAL_PREFIX}${selection.id}` : geometryNow.edges.has(editedId(selection.id)) && reconnects?.some((r) => r.relationshipId === selection.id) ? editedId(selection.id) : selection.id
      const points = geometryNow.edges.get(key)?.points
      return points && points.length > 1 ? pair(selection.type, selection.id, points[0], points[points.length - 1]) : []
    }
    if (selection.type === 'mark') {
      const mark = marks?.find((m) => m.id === selection.id)
      const ends = mark?.kind === 'arrow' ? arrowEnds(mark, scene) : undefined
      return ends ? pair('arrow', selection.id, ends.a, ends.b) : []
    }
    return []
  }, [tool, selection, geometryNow, reconnects, marks, scene, step])

  const editingItem = useMemo(() => {
    if (!editing?.id) return undefined
    const mark = marks?.find((m) => m.id === editing.id)
    if (mark && (mark.kind === 'text' || mark.kind === 'sticky')) return { initial: { text: mark.text }, size: mark.kind === 'sticky' ? { width: mark.width, height: mark.height } : undefined }
    const proposal = proposals?.find((p) => p.id === editing.id)
    return proposal ? { initial: { label: proposal.label, summary: proposal.summary }, size: { width: proposal.width, height: proposal.height } } : undefined
  }, [editing, marks, proposals])

  if (!board || !graph) return null
  const props = mapProps(step ? 'select' : tool)

  return (
    <div
      ref={mapBox}
      className={styles.canvas}
      data-connecting={connecting || undefined}
      data-labels={quiet ? 'quiet' : undefined}
      data-tool={tool}
      data-hover-scope=""
    >
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
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          autoPanOnNodeDrag={false}
          panOnScroll={false}
          zoomOnScroll
          zoomOnPinch
          onPaneClick={onPaneClick}
          panOnDrag={props.panOnDrag}
          nodesDraggable={props.nodesDraggable}
          elementsSelectable={props.elementsSelectable}
          minZoom={limits.minZoom}
          maxZoom={MAX_ZOOM}
          translateExtent={limits.extent}
          nodesConnectable={props.nodesConnectable}
          connectionMode={ConnectionMode.Loose}
          onConnect={onConnect}
          onConnectStart={() => setConnecting(true)}
          onConnectEnd={onConnectEnd}
          edgesFocusable={props.edgesFocusable}
          nodesFocusable={props.nodesFocusable}
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
          <Camera stepKey={stepKey} focus={step?.focusParts ?? []} dragging={held !== undefined} rectOf={rectOf} />
          <KeepInLimits limits={limits} />
          <LabelMode crowded={crowded} onChange={setQuiet} />
          <SnapGuides ref={guides} />
          <InkLayer marks={marks ?? []} scene={scene} selected={selection?.type === 'mark' ? selection.id : undefined} interactive={tool === 'select' && !step} onSelect={onInkSelect} onMoved={onInkMoved} hidden={hiddenArrows}>
            {handles.length > 0 && <EndHandles handles={handles} onDrop={onEndDrop} tip={endTip} />}
          </InkLayer>
          {isDrawing(tool) && !step && <DrawSurface tool={tool} scene={getScene} onDrawn={onDrawn} />}
          {editing && (!editing.id || editingItem) && (
            <Editor key={`${editing.kind}:${editing.id ?? `${editing.x},${editing.y}`}`} editing={editing} initial={editingItem?.initial ?? {}} size={editingItem?.size} onDone={onTyped} />
          )}
          {!step && <Toolbar />}
          <SpaceHand />
          <ZoomBar />
          <WheelZoom />
          <LabelScale />
          <MapHint />
        </ReactFlow>
      </CameraContext.Provider>
    </div>
  )
}

/**
 * Holding Space pans the map from anywhere, whatever the tool, as in every drawing app.
 * Not while a field, a button, or a menu has focus, where Space types or presses.
 */
function SpaceHand() {
  const uiApi = useUiApi()
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (editsText(target) || (target instanceof Element && target.closest('button, a, [role="menu"], [role="dialog"], dialog, [role="listbox"]'))) return
      event.preventDefault()
      uiApi.setSpaceHand(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') uiApi.setSpaceHand(false)
    }
    const release = () => uiApi.setSpaceHand(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
      release()
    }
  }, [uiApi])
  return null
}

/** Hands the map's instance to the canvas before any effect of the map runs, so the first camera move has it. */
function FlowHandle({ onFlow }: { onFlow: (flow: ReactFlowInstance) => void }) {
  const flow = useReactFlow()
  useLayoutEffect(() => onFlow(flow), [flow, onFlow])
  return null
}

/** The click that ends a connection drag arrives within a frame or two of the drop. */
const PANE_CLICK_GUARD_MS = 150

function cancelTimer(id: number): () => void {
  return () => window.clearTimeout(id)
}
