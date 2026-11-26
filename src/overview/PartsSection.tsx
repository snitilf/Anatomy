import clsx from 'clsx'
import { ArrowRight, ChevronRight, CircleHelp, GraduationCap, Search } from 'lucide-react'
import { useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import buttons from '../app/buttons.module.css'
import rowStyles from '../app/rows.module.css'
import { SourceNote } from '../app/SourceNote'
import { StatusGlyph } from '../status/StatusGlyph'
import { overviewMemory } from './memory'
import { filterGroups, partRowFlowText, rowSlots, type PartFilter, type PartGroup, type PartRow } from './model'
import styles from './Overview.module.css'

interface Props {
  groups: readonly PartGroup[]
  filter: PartFilter
  setFilter: (filter: PartFilter) => void
  total: number
  boardId: string
  open: (row: PartRow, key: string) => void
}

const MODE_WORD = { undecided: 'Undecided', questions: 'With open items' } as const

/**
 * Every part, grouped like Linear's issue list: a sticky header per group that collapses, a filter, a quiet column
 * header row, and rows that answer J, K, and the arrow keys. Enter opens the row on the map. C adds a note to it.
 */
export function PartsSection({ groups, filter, setFilter, total, boardId, open }: Props) {
  const memory = overviewMemory(boardId)
  const [, redraw] = useState(0)
  // The row that has focus is the one a Tab or Shift+Tab lands on, so it follows focus.
  const [focused, setFocused] = useState<string | undefined>(undefined)
  const root = useRef<HTMLElement>(null)
  const shown = useMemo(() => filterGroups(groups, filter), [groups, filter])
  const filtering = filter.query.trim() !== '' || filter.mode !== 'all'
  const count = shown.reduce((n, g) => n + g.rows.length, 0)
  // The one row a Tab lands on: the row last used, or the first.
  const keys = shown.flatMap((g) => (memory.closed.has(g.key) ? [] : g.rows.map((r) => `part:${r.id}`)))
  const current = focused ?? memory.row
  const stop = current && keys.includes(current) ? current : keys[0]

  const toggle = (key: string) => {
    if (memory.closed.has(key)) memory.closed.delete(key)
    else memory.closed.add(key)
    redraw((n) => n + 1)
  }

  function onFocus(event: FocusEvent<HTMLElement>) {
    const key = (event.target as HTMLElement).closest<HTMLElement>('[data-row^="part:"]')?.dataset.row
    if (key) setFocused(key)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const here = (event.target as HTMLElement).closest<HTMLElement>('[data-row], [data-head]')
    if (!here || event.target instanceof HTMLInputElement) return
    const step = event.key === 'j' || event.key === 'ArrowDown' ? 1 : event.key === 'k' || event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    const all = [...(root.current?.querySelectorAll<HTMLElement>('[data-row], [data-head]') ?? [])]
    const next = all[all.indexOf(here) + step]
    event.preventDefault()
    next?.focus()
  }

  return (
    <section ref={root} className={styles.section} aria-labelledby="ov-parts" data-section="parts" onKeyDown={onKeyDown} onFocus={onFocus}>
      <div className={styles.headRow}>
        <h2 id="ov-parts" className={styles.heading}>
          Parts <span className={styles.count}>{filtering ? `${count} of ${total}` : total}</span>
        </h2>
        {filter.mode !== 'all' && (
          <button type="button" className={clsx(buttons.button, buttons.small)} onClick={() => setFilter({ ...filter, mode: 'all' })}>
            {MODE_WORD[filter.mode]}
            <span aria-hidden="true"> ×</span>
            <span className="sr-only">, clear</span>
          </button>
        )}
        <label className={styles.filter}>
          <Search size={14} strokeWidth={1.5} aria-hidden="true" />
          <input
            type="search"
            name="filter"
            data-overview-filter=""
            placeholder="Filter"
            aria-label="Filter parts"
            aria-keyshortcuts="/"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              e.stopPropagation()
              if (filter.query !== '') setFilter({ ...filter, query: '' })
              else (e.target as HTMLElement).blur()
            }}
          />
          {filter.query === '' && <kbd className={styles.kbd}>/</kbd>}
        </label>
      </div>
      {count > 0 && (
        <div className={styles.partsHeader} data-parts-header="" aria-hidden="true">
          <span>Part</span>
          <span>What it does</span>
          <span className={styles.colRight}>Lesson</span>
          <span className={styles.colRight}>Open</span>
          <span className={styles.colRight}>Yours</span>
          <span />
        </div>
      )}
      {count === 0 && <p className={styles.empty}>No parts match{filter.query.trim() !== '' ? ` "${filter.query.trim()}"` : ''}.</p>}
      {shown.map((g) => {
        const closed = memory.closed.has(g.key)
        return (
          <div key={g.key} className={styles.group} data-yours={g.yours || undefined}>
            <h3 className={styles.groupHead}>
              <button type="button" className={clsx(rowStyles.row, styles.bleedRow, styles.groupToggle)} data-head={g.key} aria-expanded={!closed} onClick={() => toggle(g.key)}>
                <ChevronRight className={rowStyles.chevron} size={12} strokeWidth={1.5} aria-hidden="true" />
                <span className={styles.groupLabel}>{g.label}</span>
                <span className={styles.count}>{g.rows.length}</span>
              </button>
            </h3>
            {!closed && (
              <ul className={styles.list}>
                {g.rows.map((r) => {
                  const key = `part:${r.id}`
                  const slots = rowSlots(r)
                  const flow = partRowFlowText(r)
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={clsx(rowStyles.row, styles.bleedRow, styles.part, r.type === 'proposal' && rowStyles.yours)}
                        data-row={key}
                        data-type={r.type}
                        data-id={r.id}
                        data-yours={r.type === 'proposal' || undefined}
                        title={flow ? `${r.label} (${flow})` : undefined}
                        tabIndex={key === stop ? 0 : -1}
                        onClick={() => open(r, key)}
                      >
                        <span className={styles.partName}>
                          <span className={styles.partTitle} data-part-title="">
                            {r.label}
                          </span>
                          {slots.source && <SourceNote kind={r.source} iconOnly className={styles.sourceMark} />}
                        </span>
                        <span className={styles.partSummary} data-part-summary="">
                          {r.summary}
                        </span>
                        <span className={styles.slot} data-slot="lesson">
                          {slots.lesson && (
                            <>
                              <GraduationCap size={14} strokeWidth={1.5} aria-hidden="true" />
                              <span className="sr-only">Has a lesson</span>
                            </>
                          )}
                        </span>
                        <span className={styles.slot} data-slot="open">
                          {slots.open !== undefined && (
                            <>
                              <CircleHelp size={14} strokeWidth={1.5} aria-hidden="true" />
                              <span className={styles.figure}>{slots.open}</span>
                              <span className="sr-only">{slots.open === 1 ? 'open item' : 'open items'}</span>
                            </>
                          )}
                        </span>
                        <span className={styles.slot} data-slot="notes" data-yours="">
                          {slots.yours && (
                            <>
                              <StatusGlyph state={slots.yours.state} />
                              <span className={styles.figure}>{slots.yours.count}</span>
                              <span className="sr-only">{slots.yours.count === 1 ? 'note of yours' : 'notes of yours'}</span>
                            </>
                          )}
                        </span>
                        <ArrowRight className={rowStyles.go} size={12} strokeWidth={1.5} aria-hidden="true" />
                        {flow && <span className="sr-only">, {flow}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </section>
  )
}
