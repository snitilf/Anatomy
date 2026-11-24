import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ITEM_LABEL, SOURCE_LABEL } from '../app/labels'
import { SourceNote } from '../app/SourceNote'
import type { BoardItem, Source } from '../board/schema'
import { Markdown } from '../text/markdown'
import { useGroup } from './hooks'
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

/** Label and value rows under the title. */
export function Props({ children }: { children: ReactNode }) {
  return <dl className={styles.props}>{children}</dl>
}

export function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.prop}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/**
 * A group of the panel: a 28px header with a chevron, a title and a count, and the content under it.
 * `name` keys the remembered state. `forceOpen` shows the content whatever was chosen, for a filter that found something.
 */
export function Group({
  name,
  title,
  count,
  defaultOpen = true,
  forceOpen = false,
  label,
  children,
}: {
  name: string
  title: string
  count?: number | undefined
  defaultOpen?: boolean
  forceOpen?: boolean
  label?: string
  children: ReactNode
}) {
  const [stored, toggle] = useGroup(name, defaultOpen)
  const open = stored || forceOpen
  return (
    <section className={styles.group} aria-label={label ?? title}>
      <h3 className={styles.groupHead}>
        <button type="button" className={styles.groupToggle} aria-expanded={open} onClick={toggle}>
          <ChevronRight className={styles.chevron} size={12} strokeWidth={1.5} aria-hidden="true" />
          {title}
          {count !== undefined && <span className={styles.count}>{count}</span>}
        </button>
      </h3>
      {open && <div className={styles.groupBody}>{children}</div>}
    </section>
  )
}

/** A small heading inside a group. */
export function SubHead({ children }: { children: ReactNode }) {
  return <h4 className={styles.subHead}>{children}</h4>
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

/** The value of a row that can change: the part's name and a chevron, as a button that opens a picker. */
export function PickerValue({ children }: { children: ReactNode }) {
  return (
    <>
      <span className={styles.clip}>{children}</span>
      <ChevronDown className={styles.pickerChevron} size={12} strokeWidth={1.5} aria-hidden="true" />
    </>
  )
}

/** Where a part or connection comes from, whatever the source is, so the row is there on every one. */
export function SourceLine({ source }: { source: Source }) {
  return <SourceNote kind={source.kind} className={styles.source} />
}

export { SOURCE_LABEL }

/** The explanation, open but held to a height, with a button that shows the rest. */
export function Explanation({ source, extra }: { source: string; extra?: ReactNode }) {
  const body = useRef<HTMLDivElement>(null)
  const [long, setLong] = useState(false)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const el = body.current
    if (el) setLong(el.scrollHeight > 176)
  }, [source])
  return (
    <Group name="explanation" title="Explanation">
      {source !== '' && (
        <>
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
        </>
      )}
      {extra}
    </Group>
  )
}

/** Assumptions, unknowns, and questions, each with its kind above the text. */
export function OpenItems({ items }: { items: readonly BoardItem[] }) {
  if (items.length === 0) return null
  return (
    <Group name="open-items" title="Open items" count={items.length}>
      <ul className={styles.items}>
        {items.map((item) => (
          <li key={item.id}>
            <span className={styles.itemKind}>{ITEM_LABEL[item.kind]}</span>
            {item.text}
          </li>
        ))}
      </ul>
    </Group>
  )
}

/** What the source cites. The app does not check any of it, so it starts closed. */
export function Cited({ source }: { source: Source }) {
  if (source.references.length === 0) return null
  return (
    <Group name="cited" title="Cited, not checked" count={source.references.length} defaultOpen={false}>
      <ul className={styles.refs}>
        {source.references.map((r, i) => (
          <li key={i}>
            <span>{r.label}</span>
            {r.path && <code className={styles.path}>{r.path}</code>}
            {r.note && <span className={styles.refNote}>{r.note}</span>}
          </li>
        ))}
      </ul>
    </Group>
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

/** A destructive action at the end of a view: plain words in the danger color. */
export function DangerButton({ icon: Icon, onClick, children }: { icon: LucideIcon; onClick: () => void; children: ReactNode }) {
  return (
    <div className={styles.dangerRow}>
      <button type="button" className={styles.danger} onClick={onClick}>
        <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
        {children}
      </button>
    </div>
  )
}
