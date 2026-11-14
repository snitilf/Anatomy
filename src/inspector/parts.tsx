import { useState, type ReactNode } from 'react'
import type { Board, BoardItem, BoardRelationship, Source } from '../board/schema'
import { ArrowLeft, ArrowRight, ChevronRight, CircleHelp } from 'lucide-react'
import { ITEM_LABEL } from '../app/labels'
import { SourceNote } from '../app/SourceNote'
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
      <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
      Board overview
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

/** Where a part or connection comes from. Nothing is shown for the default, the agent's own explanation. */
export function SourceLine({ source }: { source: Source }) {
  if (source.kind === 'agent-explanation') return null
  return <SourceNote kind={source.kind} className={styles.source} />
}

/**
 * A section that starts closed, so the panel opens on what matters. `open` starts it open,
 * for content that needs the reader, such as a note that needs review.
 */
export function Disclosure({ title, count = 0, open = false, children }: { title: string; count?: number; open?: boolean; children: ReactNode }) {
  return (
    <details className={styles.disclosure} open={open || undefined}>
      <summary className={styles.disclosureTitle}>
        <ChevronRight className={styles.chevron} size={16} strokeWidth={1.5} aria-hidden="true" />
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
  const Arrow = direction === 'out' ? ArrowRight : ArrowLeft
  return (
    <button type="button" className={styles.connection} onClick={() => choose({ type: 'relationship', id: relationship.id })}>
      <Arrow className={styles.arrow} size={16} strokeWidth={1.5} aria-hidden="true" />
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{other}</span>
        <span className={styles.rowMeta}>
          <ConnectionLabel relationship={relationship} />
        </span>
      </span>
    </button>
  )
}

/** A connection's label. An unknown kind gets a question mark icon and says so to screen readers. */
export function ConnectionLabel({ relationship }: { relationship: BoardRelationship }) {
  if (relationship.kind !== 'unknown') return <>{relationship.label}</>
  return (
    <>
      <CircleHelp className={styles.unknown} size={12} strokeWidth={1.5} aria-hidden="true" />
      <span className="sr-only">Meaning unknown: </span>
      {relationship.label}
    </>
  )
}
