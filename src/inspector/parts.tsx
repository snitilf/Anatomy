import type { ReactNode } from 'react'
import type { Board, BoardItem, BoardRelationship, Source } from '../board/schema'
import { ITEM_LABEL, SOURCE_MEANING } from '../app/labels'
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

export function SourceBlock({ source }: { source: Source }) {
  return (
    <div className={styles.source}>
      <SourceBadge kind={source.kind} />
      <p className={styles.sourceText}>{SOURCE_MEANING[source.kind]}</p>
      {source.references.length > 0 && (
        <div className={styles.refs}>
          <p className={styles.refsTitle}>Cited, not checked</p>
          <ul className={styles.refList}>
            {source.references.map((r, i) => (
              <li key={i}>
                <span className={styles.refLabel}>{r.label}</span>
                {r.path && <code className={styles.path}>{r.path}</code>}
                {r.note && <span className={styles.refNote}>Note: {r.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Assumptions, unknowns, and questions, grouped by kind. */
export function ItemGroups({ items }: { items: readonly BoardItem[] }) {
  if (items.length === 0) return null
  return (
    <>
      {(['assumption', 'unknown', 'question'] as const).map((kind) => {
        const matching = items.filter((i) => i.kind === kind)
        if (matching.length === 0) return null
        return (
          <Section key={kind} title={matching.length > 1 ? `${ITEM_LABEL[kind]}s` : ITEM_LABEL[kind]}>
            <BulletList items={matching.map((i) => i.text)} />
          </Section>
        )
      })}
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
