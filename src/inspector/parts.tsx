import { useState, type ReactNode } from 'react'
import type { Board, BoardItem, BoardRelationship, Source } from '../board/schema'
import { ITEM_LABEL } from '../app/labels'
import { SourceBadge } from '../app/SourceBadge'
import styles from './parts.module.css'
import { usePanel } from './panelContext'

export function Heading({ children }: { children: ReactNode }) {
  const { headingRef } = usePanel()
  return (
    <h2 className={styles.title} tabIndex={-1} ref={headingRef}>
      {children}
    </h2>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  )
}

export function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className={styles.bullets}>
      {items.map((text, i) => (
        <li key={i}>{text}</li>
      ))}
    </ul>
  )
}

export function BackButton() {
  const { choose } = usePanel()
  return (
    <button type="button" className={styles.back} onClick={() => choose({ type: 'board' })}>
      <span aria-hidden="true">&larr;</span> Board overview
    </button>
  )
}

export function PartButton({ board, id }: { board: Board; id: string }) {
  const { choose } = usePanel()
  const label = board.components.find((c) => c.id === id)?.label ?? id
  return (
    <button type="button" className={styles.link} onClick={() => choose({ type: 'component', id })}>
      {label}
    </button>
  )
}

/** The source label of a part or connection. Its meaning is the tooltip. */
export function SourcePill({ source }: { source: Source }) {
  return (
    <div className={styles.source}>
      <SourceBadge kind={source.kind} explain />
    </div>
  )
}

/**
 * A section that starts closed, so the panel opens on what matters. `open` starts it open,
 * for content that needs the reader, such as a note that needs review.
 */
export function Disclosure({ title, count = 0, open = false, children }: { title: string; count?: number; open?: boolean; children: ReactNode }) {
  return (
    <details className={styles.disclosure} open={open || undefined}>
      <summary className={styles.disclosureTitle}>
        {title}
        {count > 0 && <span className={styles.count}>{count}</span>}
      </summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  )
}

/** What the source cites. The app does not check any of it. */
export function CitedSection({ source }: { source: Source }) {
  if (source.references.length === 0) return null
  return (
    <Disclosure title="Cited, not checked" count={source.references.length}>
      <ul className={styles.refList}>
        {source.references.map((r, i) => (
          <li key={i}>
            <span className={styles.refLabel}>{r.label}</span>
            {r.path && <code className={styles.path}>{r.path}</code>}
            {r.note && <span className={styles.refNote}>{r.note}</span>}
          </li>
        ))}
      </ul>
    </Disclosure>
  )
}

/** Assumptions, unknowns, and questions, grouped by kind, behind one heading. */
export function OpenItems({ items }: { items: readonly BoardItem[] }) {
  if (items.length === 0) return null
  return (
    <Disclosure title="Open items" count={items.length}>
      {(['assumption', 'unknown', 'question'] as const).map((kind) => {
        const matching = items.filter((i) => i.kind === kind)
        if (matching.length === 0) return null
        return (
          <div key={kind} className={styles.itemGroup}>
            <h4 className={styles.itemTitle}>{matching.length > 1 ? `${ITEM_LABEL[kind]}s` : ITEM_LABEL[kind]}</h4>
            <BulletList items={matching.map((i) => i.text)} />
          </div>
        )
      })}
    </Disclosure>
  )
}

/** Shows the first item and keeps the rest behind a button. */
export function ShortList({ items }: { items: readonly string[] }) {
  const [more, setMore] = useState(false)
  const rest = items.length - 1
  return (
    <>
      <BulletList items={more ? items : items.slice(0, 1)} />
      {rest > 0 && (
        <button type="button" className={styles.more} aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? 'Show less' : `Show ${rest} more`}
        </button>
      )}
    </>
  )
}

export function ConnectionButton({
  relationship,
  board,
  direction,
}: {
  relationship: BoardRelationship
  board: Board
  direction: 'out' | 'in'
}) {
  const { choose } = usePanel()
  const otherId = direction === 'out' ? relationship.to : relationship.from
  const other = board.components.find((c) => c.id === otherId)?.label ?? otherId
  const arrow = direction === 'out' ? '→' : '←'
  return (
    <button type="button" className={styles.connection} onClick={() => choose({ type: 'relationship', id: relationship.id })}>
      <span className={styles.connectionTitle}>
        <span aria-hidden="true" className={styles.arrow}>
          {arrow}
        </span>{' '}
        {other}
      </span>
      <span className={styles.connectionLabel}>{relationship.kind === 'unknown' ? `? ${relationship.label}` : relationship.label}</span>
    </button>
  )
}
