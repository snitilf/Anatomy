import { ViewportPortal } from '@xyflow/react'
import { useImperativeHandle, useRef, type Ref } from 'react'
import type { Guide } from './snap'
import styles from './SnapGuides.module.css'

export interface GuideLines {
  show(vertical: Guide | undefined, horizontal: Guide | undefined): void
  hide(): void
}

/**
 * The two alignment lines shown while a card moves or changes size. They are set through refs on every frame, never
 * through React state, so drawing them costs two attribute writes.
 */
export function SnapGuides({ ref }: { ref: Ref<GuideLines> }) {
  const vertical = useRef<SVGLineElement>(null)
  const horizontal = useRef<SVGLineElement>(null)
  useImperativeHandle(ref, () => {
    const set = (line: SVGLineElement | null, guide: Guide | undefined, across: boolean) => {
      if (!line) return
      if (!guide) {
        line.style.visibility = 'hidden'
        return
      }
      line.setAttribute(across ? 'y1' : 'x1', String(guide.at))
      line.setAttribute(across ? 'y2' : 'x2', String(guide.at))
      line.setAttribute(across ? 'x1' : 'y1', String(guide.from))
      line.setAttribute(across ? 'x2' : 'y2', String(guide.to))
      line.style.visibility = 'visible'
    }
    return {
      show(v, h) {
        set(vertical.current, v, false)
        set(horizontal.current, h, true)
      },
      hide() {
        set(vertical.current, undefined, false)
        set(horizontal.current, undefined, true)
      },
    }
  }, [])
  return (
    <ViewportPortal>
      <svg className={styles.guides} aria-hidden="true">
        <line ref={vertical} className={styles.line} style={{ visibility: 'hidden' }} />
        <line ref={horizontal} className={styles.line} style={{ visibility: 'hidden' }} />
      </svg>
    </ViewportPortal>
  )
}
