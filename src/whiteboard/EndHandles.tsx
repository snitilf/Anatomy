import { useStore } from '@xyflow/react'
import { useRef } from 'react'
import type { Point } from '../layout/geometry'
import type { Drop, EndRef } from './endDrop'
import { useEndDrag } from './useEndDrag'
import styles from './whiteboard.module.css'

export interface EndHandle {
  ref: EndRef
  at: Point
  /** The other end, which stays where it is while this one moves. */
  fixed: Point
}

/** The handles at both ends of the selected line, and the ghost line drawn while one is dragged. */
export function EndHandles({
  handles,
  onDrop,
  tip,
}: {
  handles: readonly EndHandle[]
  onDrop: (ref: EndRef, drop: Drop) => void
  tip?: (ref: EndRef, at: Point, part: string | undefined) => Point
}) {
  const zoom = useStore((s) => s.transform[2])
  const ghost = useRef<SVGLineElement>(null)
  const press = useEndDrag({ ghost, onDrop, ...(tip ? { tip } : {}) })
  const r = 4.5 / zoom
  const reach = 11 / zoom
  return (
    <g>
      <line ref={ghost} className={styles.ghost} />
      {handles.map((h) => (
        <g key={`${h.ref.kind}:${h.ref.id}:${h.ref.end}`} data-end={h.ref.end}>
          <circle
            className={`${styles.handleHit} nopan nodrag`}
            cx={h.at.x}
            cy={h.at.y}
            r={reach}
            aria-hidden="true"
            onPointerDown={(e) => press(e, h.ref, h.fixed)}
            onClick={(e) => e.stopPropagation()}
          />
          <circle className={styles.handle} cx={h.at.x} cy={h.at.y} r={r} />
        </g>
      ))}
    </g>
  )
}
