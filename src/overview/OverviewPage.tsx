import clsx from 'clsx'
import { ArrowRight, Diff } from 'lucide-react'
import { Fragment, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import buttons from '../app/buttons.module.css'
import { ITEM_LABEL } from '../app/labels'
import rowStyles from '../app/rows.module.css'
import { useAppStore } from '../app/store'
import { useUiApi } from '../app/ui'
import { CameraSlotContext, prefersStillness } from '../canvas/cameraContext'
import { buildFeedback, unsentCount } from '../feedback/build'
import { shortDate } from '../inspector/names'
import { LESSON_IDS } from '../lessons/catalog'
import { hasChanges, reviewCounts } from '../notes/review'
import { StatusGlyph } from '../status/StatusGlyph'
import type { ItemState } from '../status/state'
import { useOverviewActions } from './actions'
import { BetweenSection } from './BetweenSection'
import { overviewMemory } from './memory'
import { boardMeta, changeCounts, changeLine, isGoalClamped, partGroups, plural, responseLine, scopeSlice, startHereCount, type PartFilter } from './model'
import styles from './Overview.module.css'
import { PartsSection } from './PartsSection'
import { StartHere } from './StartHere'

/** One line of Needs you. A line with no state is not about the user's own items. */
interface Need {
  key: string
  state?: ItemState
  text: string
  group: string
}

type Section = 'parts' | 'between' | 'questions'

const WIDE_MIN = 960
const LESSON_SET: ReadonlySet<string> = new Set(LESSON_IDS)

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/**
 * The Overview of a board: title, goal, quiet counts, what waits for the user, where to start, parts, connections,
 * and open questions, with Scope and Details in a sticky rail when the container has room.
 */
export function OverviewPage() {
  const { board, layer, changes, previous } = useAppStore(useShallow((s) => ({ board: s.board, layer: s.layer, changes: s.changes, previous: s.previousBoard })))
  const page = useRef<HTMLDivElement>(null)
  const ui = useUiApi()
  const camera = useContext(CameraSlotContext)
  const boardId = board?.id ?? ''
  const actions = useOverviewActions(boardId)
  const [filter, setFilter] = useState<PartFilter>({ query: '', mode: 'all' })
  const [goalOpen, setGoalOpen] = useState(false)
  const [goalLong, setGoalLong] = useState(false)
  const [coversOpen, setCoversOpen] = useState(false)
  const [excludesOpen, setExcludesOpen] = useState(false)
  const [wide, setWide] = useState(false)
  const goal = useRef<HTMLParagraphElement>(null)

  const groups = useMemo(() => (board && layer ? partGroups(board, layer, LESSON_SET) : []), [board, layer])
  const counts = useMemo(() => reviewCounts(board, layer, changes), [board, layer, changes])
  const unsent = useMemo(() => {
    if (!board || !layer) return 0
    return unsentCount(buildFeedback(board, layer, { id: 'feedback-preview', now: new Date(0), scene: camera.get()?.scene() }))
    // The map's scene is read when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, layer])

  // Track the Overview container's content-box width so Scope/Details placement and cap match @container (min-width: 960px).
  useLayoutEffect(() => {
    const el = page.current
    if (!el) return
    const measure = () => {
      const cs = getComputedStyle(el)
      const pad = (Number.parseFloat(cs.paddingLeft) || 0) + (Number.parseFloat(cs.paddingRight) || 0)
      setWide(el.clientWidth - pad >= WIDE_MIN)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWide(entry.contentRect.width >= WIDE_MIN)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Back at the page: the scroll position returns, and focus goes to the row the user left from.
  useLayoutEffect(() => {
    const el = page.current
    if (!el) return
    const memory = overviewMemory(boardId)
    el.scrollTop = memory.scroll
    const row = memory.row && [...el.querySelectorAll<HTMLElement>('[data-row]')].find((r) => r.dataset.row === memory.row)
    if (row) {
      row.focus({ preventScroll: true })
      // Once the page has its final height, the sections and the fonts have settled, so the middle is the real middle.
      if (memory.reveal) requestAnimationFrame(() => requestAnimationFrame(() => row.isConnected && row.scrollIntoView({ block: 'center' })))
    } else el.focus({ preventScroll: true })
    memory.reveal = false
    // Only when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    const el = goal.current
    if (!el || goalOpen) return
    const check = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 22
      setGoalLong(isGoalClamped(el.scrollHeight, el.clientHeight, lineHeight))
    }
    check()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [board?.goal, goalOpen, wide])

  const scrollTo = useCallback((section: Section) => {
    const el = page.current?.querySelector<HTMLElement>(`[data-section="${section}"]`)
    el?.scrollIntoView({ block: 'start', behavior: prefersStillness() ? 'auto' : 'smooth' })
  }, [])

  if (!board || !layer) return null
  const memory = overviewMemory(board.id)
  const change = changeCounts(changes)
  const line = changeLine(change, board.revision)
  const changed = hasChanges(changes)
  const undecidedParts = board.components.filter((c) => c.source.kind === 'agent-proposal').length
  const undecidedLines = board.relationships.filter((r) => r.source.kind === 'agent-proposal').length
  const boardItems = board.items.filter((i) => i.about === undefined)
  const partItems = board.items.length - boardItems.length
  const lastSent = layer.sent
  const groupCount = board.groups.filter((g) => board.components.some((c) => c.group === g.id)).length
  const response = responseLine(board, layer)
  const wanted: (Need | undefined)[] = [
    counts.answers > 0 ? { key: 'answers', state: 'answered', text: plural(counts.answers, 'answer', 'answers') + ' to read', group: 'Answers' } : undefined,
    counts.relinking > 0 ? { key: 'relinking', state: 'relinking', text: `${counts.relinking} ${counts.relinking === 1 ? 'needs' : 'need'} relinking`, group: 'Needs relinking' } : undefined,
    counts.outdated > 0 ? { key: 'outdated', state: 'outdated', text: `${counts.outdated} possibly outdated`, group: 'Possibly outdated' } : undefined,
    changed && line ? { key: 'changes', text: line, group: `Changed in revision ${board.revision}` } : undefined,
  ]
  const needs = wanted.filter((n): n is Need => n !== undefined)
  const showNeeds = needs.length > 0 || unsent > 0
  const questionTotal = board.items.length
  const metaItems = boardMeta({
    parts: board.components.length,
    groups: groupCount,
    connections: board.relationships.length + layer.links.length,
    questions: questionTotal,
  })
  const scopeLimit = wide ? 5 : 3
  const covers = scopeSlice(board.scope.includes, scopeLimit, coversOpen)
  const excludes = scopeSlice(board.scope.excludes, scopeLimit, excludesOpen)

  const filterParts = (mode: PartFilter['mode']) => {
    setFilter({ query: '', mode })
    // After the list has taken the filter.
    requestAnimationFrame(() => scrollTo('parts'))
  }

  const head = (
    <header className={styles.head}>
      <h1 className={styles.title}>{board.title}</h1>
      <p ref={goal} className={styles.goal} data-open={goalOpen || undefined}>
        {board.goal}
      </p>
      {(goalLong || goalOpen) && (
        <button type="button" className={clsx(buttons.button, buttons.link, buttons.small, styles.more)} aria-expanded={goalOpen} onClick={() => setGoalOpen(!goalOpen)}>
          {goalOpen ? 'Show less' : 'Show more'}
        </button>
      )}
      <div className={styles.metaLine}>
        {metaItems.map((item, i) => (
          <Fragment key={item.section}>
            {i > 0 && (
              <span className={styles.sep} aria-hidden="true">
                ·
              </span>
            )}
            <button
              type="button"
              className={clsx(buttons.button, buttons.link, buttons.small, styles.metaLink)}
              data-row={`meta:${item.section}`}
              onClick={() => scrollTo(item.section)}
            >
              {item.text}
            </button>
          </Fragment>
        ))}
      </div>
    </header>
  )

  const needsSection = showNeeds && (
    <section className={styles.section} aria-labelledby="ov-needs" data-section="needs">
      <h2 id="ov-needs" className={styles.heading}>
        Needs you
      </h2>
      <div className={styles.needsCard} data-raised="">
        <ul className={styles.list}>
          {needs.map(({ key, state, text, group }) => (
            <li key={key}>
              <button type="button" className={rowStyles.row} data-row={`needs:${key}`} onClick={() => actions.openReview(group, `needs:${key}`)}>
                {state ? <StatusGlyph state={state} withWord /> : <Diff className={rowStyles.icon} size={14} strokeWidth={1.5} aria-hidden="true" />}
                <span className={styles.grow}>{text}</span>
                <ArrowRight className={rowStyles.go} size={12} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </li>
          ))}
          {unsent > 0 && (
            <li className={styles.unsent}>
              <span className={styles.lineStatic}>
                <StatusGlyph state="unsent" withWord />
                <span className={styles.yoursText}>{plural(unsent, 'item', 'items')} not sent</span>
              </span>
              <button type="button" className={clsx(buttons.button, buttons.primary, buttons.small)} data-row="needs:send" onClick={() => ui.setSendOpen(true)}>
                Send to agent
              </button>
            </li>
          )}
        </ul>
      </div>
      {response && <p className={styles.note}>{response}</p>}
    </section>
  )

  const startSection = startHereCount(board) > 0 && (
    <section className={styles.section} aria-labelledby="ov-start" data-section="start">
      <h2 id="ov-start" className={styles.heading}>
        Start here
      </h2>
      <StartHere
        board={board}
        onPlay={(id, key) => actions.play(id, key)}
        onOpenLesson={(id, partId) => ui.openLesson(id, partId)}
        rowClassName={styles.bleedRow}
      />
    </section>
  )

  const scopeSection = (board.scope.includes.length > 0 || board.scope.excludes.length > 0) && (
    <section className={clsx(styles.section, wide && styles.railSection)} aria-labelledby="ov-scope" data-section="scope">
      <h2 id="ov-scope" className={styles.heading}>
        Scope
      </h2>
      <div className={styles.scope}>
        {board.scope.includes.length > 0 && (
          <div>
            <h3 className={styles.sub}>Covers</h3>
            <ul className={styles.bullets}>
              {covers.items.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            {covers.moreLabel && (
              <button
                type="button"
                className={clsx(buttons.button, buttons.link, buttons.small, styles.more)}
                aria-expanded={coversOpen}
                onClick={() => setCoversOpen(!coversOpen)}
              >
                {covers.moreLabel}
              </button>
            )}
          </div>
        )}
        {board.scope.excludes.length > 0 && (
          <div>
            <h3 className={styles.sub}>Does not cover</h3>
            <ul className={styles.bullets}>
              {excludes.items.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
            {excludes.moreLabel && (
              <button
                type="button"
                className={clsx(buttons.button, buttons.link, buttons.small, styles.more)}
                aria-expanded={excludesOpen}
                onClick={() => setExcludesOpen(!excludesOpen)}
              >
                {excludes.moreLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )

  const partsSection = (
    <PartsSection
      groups={groups}
      filter={filter}
      setFilter={setFilter}
      total={groups.reduce((n, g) => n + g.rows.length, 0)}
      open={(row, key) => actions.openOnMap({ type: row.type, id: row.id }, key)}
      boardId={board.id}
    />
  )

  const betweenSection = <BetweenSection board={board} layer={layer} actions={actions} />

  const questionsSection = questionTotal > 0 && (
    <section className={styles.section} aria-labelledby="ov-questions" data-section="questions">
      <h2 id="ov-questions" className={styles.heading}>
        Open questions <span className={styles.count}>{questionTotal}</span>
      </h2>
      {(['question', 'unknown', 'assumption'] as const).map((kind) => {
        const items = boardItems.filter((i) => i.kind === kind)
        if (items.length === 0) return null
        return (
          <div key={kind}>
            <h3 className={styles.sub}>{ITEM_LABEL[kind]}s</h3>
            <ul className={styles.bullets}>
              {items.map((i) => (
                <li key={i.id}>{i.text}</li>
              ))}
            </ul>
          </div>
        )
      })}
      {partItems > 0 && (
        <button type="button" className={clsx(buttons.button, buttons.link, buttons.small, styles.more)} data-row="questions:parts" onClick={() => filterParts('questions')}>
          {boardItems.length > 0 ? `${partItems} more on parts` : `${partItems} on parts`}
        </button>
      )}
    </section>
  )

  const detailsSection = (
    <section className={clsx(styles.section, wide && styles.railSection)} aria-labelledby="ov-details" data-section="details">
      <h2 id="ov-details" className={styles.heading}>
        Details
      </h2>
      <dl className={styles.details}>
        <DetailRow label="Revision">
          <span className={styles.num}>{board.revision}</span>
          {changed && change.parts > 0 && previous && (
            <>
              <span className={styles.sep} aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                className={clsx(buttons.button, buttons.link, buttons.small, styles.metaLink)}
                data-row="prop:changes"
                onClick={() => actions.openReview(`Changed in revision ${board.revision}`, 'prop:changes')}
              >
                {plural(change.parts, 'part', 'parts')} changed since {previous.revision}
              </button>
            </>
          )}
        </DetailRow>
        <DetailRow label="Last sent">
          {lastSent ? (
            <span>
              {shortDate(lastSent.at)}, revision {lastSent.baseRevision}
            </span>
          ) : (
            <span className={styles.quiet}>Not sent yet</span>
          )}
        </DetailRow>
        {undecidedParts + undecidedLines > 0 && (
          <DetailRow label="Undecided">
            {undecidedParts > 0 && (
              <button
                type="button"
                className={clsx(buttons.button, buttons.link, buttons.small, styles.metaLink)}
                data-row="prop:undecided"
                onClick={() => filterParts('undecided')}
              >
                {plural(undecidedParts, 'part', 'parts')}
              </button>
            )}
            {undecidedLines > 0 && (
              <button
                type="button"
                className={clsx(buttons.button, buttons.link, buttons.small, styles.metaLink)}
                data-row="prop:undecided-lines"
                onClick={() => scrollTo('between')}
              >
                {plural(undecidedLines, 'connection', 'connections')}
              </button>
            )}
          </DetailRow>
        )}
      </dl>
    </section>
  )

  return (
    <div
      ref={page}
      className={styles.page}
      data-testid="overview"
      role="region"
      aria-label="Overview"
      tabIndex={-1}
      onScroll={(e) => {
        memory.scroll = e.currentTarget.scrollTop
      }}
      onFocus={(e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-row]')
        if (row?.dataset.row) memory.row = row.dataset.row
      }}
    >
      <div className={styles.layout}>
        <div className={styles.main}>
          {head}
          {needsSection}
          {startSection}
          {partsSection}
          {betweenSection}
          {questionsSection}
        </div>
        <aside className={styles.rail} aria-label="Board details">
          {scopeSection}
          {detailsSection}
        </aside>
      </div>
    </div>
  )
}
