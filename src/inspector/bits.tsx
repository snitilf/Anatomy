import clsx from 'clsx'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import buttons from '../app/buttons.module.css'
import { ITEM_LABEL, SOURCE_LABEL } from '../app/labels'
import rows from '../app/rows.module.css'
import { SourceNote } from '../app/SourceNote'
import type { BoardItem, Source } from '../board/schema'
import { Markdown } from '../text/markdown'
import { explanationCut, type CutBlock } from './explanationClamp'
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
 * A collapsible section of the panel: 13/20 semibold heading starting on edge A, count in --fg-3,
 * trailing 12px chevron shown on hover/focus (always on touch), and optional trailing action button.
 */
export function Group({
  name,
  title,
  count,
  defaultOpen = true,
  forceOpen = false,
  label,
  action,
  children,
}: {
  name: string
  title: string
  count?: number | undefined
  defaultOpen?: boolean
  forceOpen?: boolean
  label?: string
  action?: ReactNode
  children: ReactNode
}) {
  const [stored, toggle] = useGroup(name, defaultOpen)
  const open = stored || forceOpen
  return (
    <section className={styles.group} aria-label={label ?? title}>
      <div className={styles.groupBar}>
        <h3 className={styles.groupHead}>
          <button type="button" className={clsx(rows.row, rows.sm, styles.groupToggle)} aria-expanded={open} onClick={toggle}>
            <span className={styles.groupTitle}>{title}</span>
            {count !== undefined && <span className={styles.count}>{count}</span>}
            <ChevronRight className={styles.chevron} size={12} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </h3>
        {action && <div className={styles.groupAction}>{action}</div>}
      </div>
      {open && <div className={styles.groupBody}>{children}</div>}
    </section>
  )
}

/** A small heading inside a group. */
export function SubHead({ children }: { children: ReactNode }) {
  return <h4 className={styles.subHead}>{children}</h4>
}

/** A part's name as an inline link button that selects it. A part that is gone is struck through. */
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

/** Where a part or connection comes from, whatever the source is, so it is always shown. */
export function SourceLine({ source, className }: { source: Source; className?: string | undefined }) {
  return <SourceNote kind={source.kind} className={clsx(styles.source, className)} />
}

export { SOURCE_LABEL }

/** Measure direct blocks of a Markdown container, expanding lists into individual items so a cut never splits an item. */
function measureBlocks(container: HTMLElement): { totalHeight: number; blocks: CutBlock[]; lineHeight: number } {
  const origin = container.getBoundingClientRect().top
  const blocks: CutBlock[] = []
  for (const child of Array.from(container.children)) {
    const tag = child.tagName
    if (tag === 'UL' || tag === 'OL') {
      for (const item of Array.from(child.children)) {
        const rect = item.getBoundingClientRect()
        if (rect.height > 0) blocks.push({ top: rect.top - origin, bottom: rect.bottom - origin, splittable: false })
      }
    } else {
      const rect = child.getBoundingClientRect()
      if (rect.height > 0) blocks.push({ top: rect.top - origin, bottom: rect.bottom - origin, splittable: tag === 'P' })
    }
  }
  const parsedLine = parseFloat(getComputedStyle(container).lineHeight)
  const lineHeight = Number.isFinite(parsedLine) && parsedLine > 0 ? parsedLine : 20
  return { totalHeight: container.scrollHeight, blocks, lineHeight }
}

/** The explanation, uncut up to 320 px, then cut cleanly between blocks when at least 40 px is hidden. */
export function Explanation({ source, extra }: { source: string; extra?: ReactNode }) {
  const body = useRef<HTMLDivElement>(null)
  const [cut, setCut] = useState<number | null>(null)
  const [openedFor, setOpenedFor] = useState<string | undefined>(undefined)
  const open = openedFor === source

  useLayoutEffect(() => {
    const el = body.current
    if (!el || source === '') {
      return
    }
    const prose = el.firstElementChild as HTMLElement | null
    if (!prose) return
    const measure = () => {
      const { totalHeight, blocks, lineHeight } = measureBlocks(prose)
      setCut(explanationCut(totalHeight, blocks, { lineHeight }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [source])

  const effectiveCut = source === '' ? null : cut
  const clipped = effectiveCut !== null && !open
  return (
    <Group name="explanation" title="Explanation">
      {source !== '' && (
        <>
          <div className={styles.explain} data-clipped={clipped ? '' : undefined} style={clipped ? { maxHeight: `${effectiveCut}px` } : undefined}>
            <div ref={body}>
              <Markdown source={source} className={styles.prose ?? ''} />
            </div>
          </div>
          {effectiveCut !== null && (
            <button
              type="button"
              className={clsx(buttons.button, buttons.link, buttons.small, styles.more)}
              aria-expanded={open}
              onClick={() => setOpenedFor(open ? undefined : source)}
            >
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
        <button
          type="button"
          className={clsx(buttons.button, buttons.link, buttons.small, styles.more)}
          aria-expanded={all}
          onClick={() => setAll(!all)}
        >
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
      <button type="button" className={clsx(buttons.button, buttons.quiet, buttons.small, styles.danger)} onClick={onClick}>
        <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
        {children}
      </button>
    </div>
  )
}
