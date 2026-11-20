import type { CSSProperties } from 'react'
import { YOURS_DASH, YOURS_FAR_DASH } from './kinds'
import styles from './CardNode.module.css'

const DASHES = { '--dash': YOURS_DASH, '--far-dash': YOURS_FAR_DASH } as CSSProperties

/**
 * The edge of a part the user proposed, in the dash and dot of the user's links, so the part reads as theirs without its
 * color. A CSS border cannot draw that rhythm, so the edge is a rectangle over the card's own border, which stays clear.
 */
export function YoursEdge({ selected = false }: { selected?: boolean }) {
  return (
    <svg className={styles.yoursEdge} data-selected={selected || undefined} style={DASHES} aria-hidden="true">
      {/* The geometry is set in CSS from the edge width; these attributes stand in where CSS geometry is not supported. */}
      <rect width="100%" height="100%" rx="8" />
    </svg>
  )
}
