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
import { buildGraph, MANUAL_PREFIX } from './buildGraph'
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
/** Keeps the selected part in view. On a narrow screen the whole map is tiny, so it zooms in on the part. */
function KeepSelectionInView() {
  const { selection, board } = useAppState()
  const flow = useReactFlow()
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const previous = useRef<string | undefined>(undefined)
  const key = selection && selection.type !== 'board' ? `${selection.type}:${selection.id}` : undefined

  useEffect(() => {
    if (previous.current === key) return
    previous.current = key
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
  }, [key, selection, board, flow, width, height])

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
function Camera({ stepKey, focus }: { stepKey: string | undefined; focus: readonly string[] }) {
  const flow = useReactFlow()
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const latest = useRef({ stepKey, focus })
  const size = useRef({ width, height })
  const shown = useRef<string | undefined>(undefined)

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
    const timer = window.setTimeout(() => fit(false), RESIZE_MS)
    return () => window.clearTimeout(timer)
  }, [width, height, fit])

  return null
}

export function Canvas() {
  const state = useAppState()
  const { board, overlay, selection } = state
  const dispatch = useAppDispatch()
  const stored = overlay?.positions
  // Positions follow the pointer while a card is dragged. The app state gets the final spot.
  const [seen, setSeen] = useState(stored)
  const [live, setLive] = useState<Record<string, Point>>(stored ?? {})
  if (seen !== stored) {
    setSeen(stored)
    setLive(stored ?? {})
  }

  const step = useMemo(() => currentStep({ board: state.board, scenario: state.scenario }), [state.board, state.scenario])
  const links = overlay?.manualLinks
  const noteCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of overlay?.notes ?? []) {
      if (n.target.type === 'component') counts.set(n.target.id, (counts.get(n.target.id) ?? 0) + 1)
    }
    return counts
  }, [overlay?.notes])
  const graph = useMemo(
    () => (board ? buildGraph(board, live, selection, step?.highlight, links, noteCounts) : undefined),
    [board, live, selection, step, links, noteCounts],
  )
  const [connecting, setConnecting] = useState(false)
  const stepKey = step ? `${step.scenario.id}:${step.index}` : undefined

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.id.startsWith('group:')) {
          const { id, position } = change
          setLive((prev) => ({ ...prev, [id]: position }))
          // Arrow keys move a card with `dragging` unset. Dragging commits on drag stop.
          if (change.dragging !== true) dispatch({ type: 'cardMoved', id, point: position })
        } else if (change.type === 'select' && change.selected && !change.id.startsWith('group:')) {
          dispatch({ type: 'select', selection: { type: 'component', id: change.id } })
        }
      }
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
        onNodeDragStop={(_, node) => dispatch({ type: 'cardMoved', id: node.id, point: node.position })}
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
        <KeepSelectionInView />
        <Camera stepKey={stepKey} focus={step?.focusParts ?? []} />
        <Controls showInteractive={false} fitViewOptions={FIT} position="bottom-right" />
      </ReactFlow>
      <Legend />
    </div>
  )
}
