import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { readTint } from './labelTint'
import styles from './RelationshipEdge.module.css'

/** One line of the label's words, with its padding, in layout pixels from the top left of the label. */
interface Measured {
  lines: readonly Line[]
  /** The middle of the label, which the group areas are placed from. */
  centerX: number
  centerY: number
}

interface Line {
  left: number
  top: number
  width: number
  height: number
}

const round = (n: number) => Math.round(n * 2) / 2

function same(a: Measured, b: Measured): boolean {
  return a.centerX === b.centerX && a.centerY === b.centerY && a.lines.length === b.lines.length && a.lines.every((l, i) => l.left === b.lines[i]!.left && l.top === b.lines[i]!.top && l.width === b.lines[i]!.width && l.height === b.lines[i]!.height)
}

/**
 * The words of a label on their cutout. The cutout hugs each line of the words, so a short second line breaks the
 * connection no wider than the words do. Under each line sits the map color with every group area under the label painted on
 * it the way the map paints it, so the cutout matches the map on both sides of a group edge.
 * The lines are read from the page, once the words are laid out and again whenever the label changes size.
 */
export function LabelCutout({ tint, children }: { tint: string; children: ReactNode }) {
  const words = useRef<HTMLSpanElement>(null)
  const [{ lines, centerX, centerY }, setMeasured] = useState<Measured>({ lines: [], centerX: 0, centerY: 0 })
  const areas = useMemo(() => readTint(tint), [tint])

  useLayoutEffect(() => {
    const span = words.current
    const pill = span?.parentElement
    if (!span || !pill) return
    const measure = () => {
      const box = pill.getBoundingClientRect()
      // The map may be zoomed: the label's own pixels are its layout size.
      const scale = pill.offsetWidth > 0 ? box.width / pill.offsetWidth : 1
      if (scale <= 0) return
      const next = [...span.getClientRects()]
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ left: round((r.left - box.left) / scale), top: round((r.top - box.top) / scale), width: round(r.width / scale), height: round(r.height / scale) }))
      const measured = { lines: next, centerX: pill.offsetWidth / 2, centerY: pill.offsetHeight / 2 }
      setMeasured((prev) => (same(prev, measured) ? prev : measured))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(pill)
    return () => watch.disconnect()
  }, [children])

  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className={styles.backdrop} data-cutout="" aria-hidden="true" style={{ left: line.left, top: line.top, width: line.width, height: line.height }}>
          {areas.map((a, j) => (
            <span key={j} className={styles.tint} data-tint="" style={{ left: centerX + a.left - line.left, top: centerY + a.top - line.top, width: a.width, height: a.height }} />
          ))}
        </span>
      ))}
      <span ref={words} className={styles.cutout}>
        {children}
      </span>
    </>
  )
}
