import {
  Background,
  Controls,
  ReactFlow,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
  useReactFlow,
  useStore,
  type EdgeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppState } from '../app/appContext'
import { CARD_HEIGHT, CARD_WIDTH } from '../overlay/layout'
import type { Point } from '../overlay/types'
import { buildGraph } from './buildGraph'
import { CardNode } from './CardNode'
import styles from './Canvas.module.css'
import { GroupNode } from './GroupNode'
import { Legend } from './Legend'
import { RelationshipEdge } from './RelationshipEdge'

const nodeTypes: NodeTypes = { card: CardNode, 'group-area': GroupNode }
const edgeTypes: EdgeTypes = { relationship: RelationshipEdge }
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

export function Canvas() {
  const { board, overlay, selection } = useAppState()
  const dispatch = useAppDispatch()
  const stored = overlay?.positions
  // Positions follow the pointer while a card is dragged. The app state gets the final spot.
  const [seen, setSeen] = useState(stored)
  const [live, setLive] = useState<Record<string, Point>>(stored ?? {})
  if (seen !== stored) {
    setSeen(stored)
    setLive(stored ?? {})
  }

  const graph = useMemo(() => (board ? buildGraph(board, live, selection) : undefined), [board, live, selection])

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
          dispatch({ type: 'select', selection: { type: 'relationship', id: change.id } })
        }
      }
    },
    [dispatch],
  )

  if (!board || !graph) return null

  return (
    <div className={styles.canvas}>
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
        minZoom={0.3}
        maxZoom={1.6}
        nodesConnectable={false}
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
        <Controls showInteractive={false} fitViewOptions={FIT} position="bottom-right" />
      </ReactFlow>
      <Legend />
    </div>
  )
}
