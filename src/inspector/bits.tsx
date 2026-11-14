import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ITEM_LABEL, SOURCE_LABEL } from '../app/labels'
import { SourceNote } from '../app/SourceNote'
import type { BoardItem, Source } from '../board/schema'
import { Markdown } from '../text/markdown'
import { usePanel } from './panelContext'
import styles from './view.module.css'

/** The heading of a view. Focus moves to it when the view changes from inside the panel. */
export function Heading({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon | undefined }) {
  const { headingRef } = usePanel()
  const heading = (
    <h2 className={styles.title} tabIndex={-1} ref={headingRef}>
      {children}
    </h2>
  )
  if (!Icon) return heading
  return (
    <div className={styles.titleRow}>
      <Icon className={styles.titleIcon} size={16} strokeWidth={1.5} aria-hidden="true" />
      {heading}
    </div>
  )
}

/** The way back to the board overview, at the top of every view but the overview. Escape does the same. */
export function BackButton() {
  const { choose } = usePanel()
  return (
    <button type="button" className={styles.back} onClick={() => choose({ type: 'board' })}>
      <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
      Overview
    </button>
  )
}

export function Section({ title, count, children, label }: { title: string; count?: number | undefined; children: ReactNode; label?: string }) {
  return (
    <section className={styles.section} aria-label={label ?? title}>
      <h3 className={styles.sectionHead}>
        {title}
        {count !== undefined && <span className={styles.count}>{count}</span>}
      </h3>
      {children}
    </section>
  )
}

/** A closed section. */
export function Disclosure({ title, count, children }: { title: string; count?: number | undefined; children: ReactNode }) {
  return (
    <details className={styles.disclosure}>
      <summary>
        <ChevronRight className={styles.chevron} size={14} strokeWidth={1.5} aria-hidden="true" />
        {title}
        {count !== undefined && <span className={styles.count}>{count}</span>}
      </summary>
      {children}
    </details>
  )
}


/** A part's name as a button that selects it. A part that is gone is struck through. */
export function PartLink({ id, name }: { id: string; name: string | undefined }) {
  const { choose } = usePanel()
  if (name === undefined) return <span className={styles.gone}>{id}</span>
  const type = id.startsWith('part-') ? 'proposal' : 'component'
  return (
    <button type="button" className={styles.partLink} onClick={() => choose({ type, id })}>
      {name}
    </button>
  )
}

/** Where a part or connection comes from, when it is not the agent's own explanation. */
export function SourceLine({ source }: { source: Source }) {
  if (source.kind === 'agent-explanation') return null
  return <SourceNote kind={source.kind} className={styles.source} />
}

export { SOURCE_LABEL }

/** The explanation, open but held to a height, with a button that shows the rest. */
export function Explanation({ source }: { source: string }) {
  const body = useRef<HTMLDivElement>(null)
  const [long, setLong] = useState(false)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const el = body.current
    if (el) setLong(el.scrollHeight > 176)
  }, [source])
  return (
    <Section title="Explanation">
      <div className={styles.explain} data-clipped={long && !open ? '' : undefined}>
        <div ref={body}>
          <Markdown source={source} className={styles.prose ?? ''} />
        </div>
      </div>
      {long && (
        <button type="button" className={styles.more} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </Section>
  )
}

/** Assumptions, unknowns, and questions, each with its kind above the text. */
export function OpenItems({ items }: { items: readonly BoardItem[] }) {
  if (items.length === 0) return null
  return (
    <Section title="Open items" count={items.length}>
      <ul className={styles.items}>
        {items.map((item) => (
          <li key={item.id}>
            <span className={styles.itemKind}>{ITEM_LABEL[item.kind]}</span>
            {item.text}
          </li>
        ))}
      </ul>
    </Section>
  )
}

/** What the source cites. The app does not check any of it, so it starts closed. */
export function Cited({ source }: { source: Source }) {
  if (source.references.length === 0) return null
  return (
    <Disclosure title="Cited, not checked" count={source.references.length}>
      <ul className={styles.refs}>
        {source.references.map((r, i) => (
          <li key={i}>
            <span>{r.label}</span>
            {r.path && <code className={styles.path}>{r.path}</code>}
            {r.note && <span className={styles.refNote}>{r.note}</span>}
          </li>
        ))}
      </ul>
    </Disclosure>
  )
}

/** The first few entries, and a button for the rest. */
export function ShortList({ items, first = 2 }: { items: readonly string[]; first?: number }) {
  const [all, setAll] = useState(false)
  const rest = items.length - first
  return (
    <>
      <ul className={styles.plainList}>
        {(all ? items : items.slice(0, first)).map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
      {rest > 0 && (
        <button type="button" className={styles.more} aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? 'Show less' : `Show ${rest} more`}
        </button>
      )}
    </>
  )
}


