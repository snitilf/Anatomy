import { GraduationCap, Play, Diff } from 'lucide-react'
import { useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../app/store'
import { useUiApi } from '../app/ui'
import { ITEM_LABEL } from '../app/labels'
import { CameraSlotContext, prefersStillness } from '../canvas/cameraContext'
import { buildFeedback, unsentCount } from '../feedback/build'
import { shortDate } from '../inspector/names'
import { StatusGlyph } from '../status/StatusGlyph'
import type { ItemState } from '../status/state'
import { findLesson, LESSON_IDS } from '../lessons/catalog'
import { LessonDialog } from '../lessons/LessonDialog'
import { hasChanges, reviewCounts } from '../notes/review'
import { useOverviewActions } from './actions'
import { overviewMemory } from './memory'
import { changeCounts, changeLine, partGroups, plural, responseLine, type PartFilter } from './model'
import { PartsSection } from './PartsSection'
import styles from './Overview.module.css'
import { BetweenSection } from './BetweenSection'

/** One line of Needs you. A line with no state is not about the user's own items. */
interface Need {
  key: string
  state?: ItemState
  text: string
  group: string
}

type Section = 'parts' | 'between' | 'questions'

/** A value that opens something: plain text with a quiet fill on hover. */
function Link({ children, onClick, row }: { children: React.ReactNode; onClick: () => void; row: string }) {
  return (
    <button type="button" className={styles.link} data-row={row} onClick={onClick}>
      {children}
    </button>
  )
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.prop}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

const LESSON_SET: ReadonlySet<string> = new Set(LESSON_IDS)

/**
 * The Overview of a board: the goal, the properties, what waits for the user, where to start, every part by group,
 * the connections between groups, the scope, and the open questions. It covers the map, reads what the store already holds,
 * and every row and count opens its item on the map.
 */
export function OverviewPage() {
  const { board, layer, changes, previous } = useAppStore(useShallow((s) => ({ board: s.board, layer: s.layer, changes: s.changes, previous: s.previousBoard })))
  const page = useRef<HTMLDivElement>(null)
  const ui = useUiApi()
  const camera = useContext(CameraSlotContext)
  const boardId = board?.id ?? ''
  const actions = useOverviewActions(boardId)
  const [filter, setFilter] = useState<PartFilter>({ query: '', mode: 'all' })
  const [lesson, setLesson] = useState<{ id: string; row: string } | undefined>()
  const [goalOpen, setGoalOpen] = useState(false)
  const [goalLong, setGoalLong] = useState(false)
  const goal = useRef<HTMLParagraphElement>(null)

  const groups = useMemo(() => (board && layer ? partGroups(board, layer, LESSON_SET) : []), [board, layer])
  const counts = useMemo(() => reviewCounts(board, layer, changes), [board, layer, changes])
  const unsent = useMemo(() => {
    if (!board || !layer) return 0
    return unsentCount(buildFeedback(board, layer, { id: 'feedback-preview', now: new Date(0), scene: camera.get()?.scene() }))
    // The map's scene is read when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, layer])

  // Back at the page: the scroll position returns, and focus goes to the row the user left from.
  useLayoutEffect(() => {
    const el = page.current
    if (!el) return
    const memory = overviewMemory(boardId)
    el.scrollTop = memory.scroll
    const row = memory.row && [...el.querySelectorAll<HTMLElement>('[data-row]')].find((r) => r.dataset.row === memory.row)
    if (row) row.focus({ preventScroll: true })
    else el.focus({ preventScroll: true })
    // Only when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    const el = goal.current
    if (el && !goalOpen) setGoalLong(el.scrollHeight > el.clientHeight + 1)
  }, [board?.goal, goalOpen])

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
  const lessons = board.components.flatMap((c) => (c.lesson && findLesson(c.lesson) ? [{ part: c, lesson: findLesson(c.lesson)! }] : []))
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

  const filterParts = (mode: PartFilter['mode']) => {
    setFilter({ query: '', mode })
    // After the list has taken the filter.
    requestAnimationFrame(() => scrollTo('parts'))
  }

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
      <div className={styles.column}>
        <header className={styles.head}>
          <h2 className={styles.title}>{board.title}</h2>
          <p ref={goal} className={styles.goal} data-open={goalOpen || undefined}>
            {board.goal}
          </p>
          {(goalLong || goalOpen) && (
            <button type="button" className={styles.more} aria-expanded={goalOpen} onClick={() => setGoalOpen(!goalOpen)}>
              {goalOpen ? 'Show less' : 'Show more'}
            </button>
          )}
        </header>

        <dl className={styles.props}>
          <Prop label="Revision">
            <span className={styles.num}>{board.revision}</span>
            {changed && change.parts > 0 && previous && (
              <span className={styles.dot} aria-hidden="true">
                ·
              </span>
            )}
            {changed && change.parts > 0 && previous && (
              <Link row="prop:changes" onClick={() => actions.openReview(`Changed in revision ${board.revision}`, 'prop:changes')}>
                {plural(change.parts, 'part', 'parts')} changed since {previous.revision}
              </Link>
            )}
          </Prop>
          <Prop label="Parts">
            <Link row="prop:parts" onClick={() => scrollTo('parts')}>
              {board.components.length}
              {groupCount > 0 && ` in ${plural(groupCount, 'group', 'groups')}`}
            </Link>
          </Prop>
          {board.relationships.length + layer.links.length > 0 && (
            <Prop label="Connections">
              <Link row="prop:connections" onClick={() => scrollTo('between')}>
                {board.relationships.length + layer.links.length}
              </Link>
            </Prop>
          )}
          {undecidedParts + undecidedLines > 0 && (
            <Prop label="Undecided">
              {undecidedParts > 0 && (
                <Link row="prop:undecided" onClick={() => filterParts('undecided')}>
                  {plural(undecidedParts, 'part', 'parts')}
                </Link>
              )}
              {undecidedLines > 0 && (
                <Link row="prop:undecided-lines" onClick={() => scrollTo('between')}>
                  {plural(undecidedLines, 'connection', 'connections')}
                </Link>
              )}
            </Prop>
          )}
          {questionTotal > 0 && (
            <Prop label="Open questions">
              <Link row="prop:questions" onClick={() => scrollTo('questions')}>
                {questionTotal}
              </Link>
            </Prop>
          )}
          <Prop label="Last sent">
            {lastSent ? (
              <span>
                {shortDate(lastSent.at)}, revision {lastSent.baseRevision}
              </span>
            ) : (
              <span className={styles.quiet}>Not sent yet</span>
            )}
          </Prop>
        </dl>

        {showNeeds && (
          <section className={styles.section} aria-labelledby="ov-needs" data-section="needs">
            <h3 id="ov-needs" className={styles.heading}>
              Needs you
            </h3>
            <ul className={styles.list}>
              {needs.map(({ key, state, text, group }) => (
                <li key={key}>
                  <button type="button" className={styles.line} data-row={`needs:${key}`} onClick={() => actions.openReview(group, `needs:${key}`)}>
                    {state ? <StatusGlyph state={state} withWord /> : <Diff className={styles.icon} size={14} strokeWidth={1.5} aria-hidden="true" />}
                    {text}
                  </button>
                </li>
              ))}
              {unsent > 0 && (
                <li className={styles.unsent}>
                  <span className={styles.lineStatic}>
                    <StatusGlyph state="unsent" withWord />
                    <span className={styles.yoursText}>{plural(unsent, 'item', 'items')} not sent</span>
                  </span>
                  <button type="button" className={styles.action} data-row="needs:send" onClick={() => ui.setSendOpen(true)}>
                    Send to agent
                  </button>
                </li>
              )}
            </ul>
            {response && <p className={styles.note}>{response}</p>}
          </section>
        )}

        {(board.scenarios.length > 0 || lessons.length > 0) && (
          <section className={styles.section} aria-labelledby="ov-start" data-section="start">
            <h3 id="ov-start" className={styles.heading}>
              Start here
            </h3>
            <ul className={styles.list}>
              {board.scenarios.map((s) => (
                <li key={s.id}>
                  <button type="button" className={styles.line} data-row={`walk:${s.id}`} aria-label={`Play ${s.title}`} onClick={() => actions.play(s.id, `walk:${s.id}`)}>
                    <Play className={styles.icon} size={14} strokeWidth={1.5} aria-hidden="true" />
                    <span className={styles.grow}>{s.title}</span>
                    <span className={styles.end}>{plural(s.steps.length, 'step', 'steps')}</span>
                  </button>
                </li>
              ))}
              {lessons.map(({ part, lesson: l }) => (
                <li key={part.id}>
                  <button type="button" className={styles.line} data-row={`lesson:${part.id}`} onClick={() => setLesson({ id: l.id, row: `lesson:${part.id}` })}>
                    <GraduationCap className={styles.icon} size={14} strokeWidth={1.5} aria-hidden="true" />
                    <span className={styles.grow}>{l.title}</span>
                    <span className={styles.end}>on {part.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <PartsSection
          groups={groups}
          filter={filter}
          setFilter={setFilter}
          total={groups.reduce((n, g) => n + g.rows.length, 0)}
          open={(row, key) => actions.openOnMap({ type: row.type, id: row.id }, key)}
          boardId={board.id}
        />

        <BetweenSection board={board} layer={layer} actions={actions} />

        {(board.scope.includes.length > 0 || board.scope.excludes.length > 0) && (
          <section className={styles.section} aria-labelledby="ov-scope" data-section="scope">
            <h3 id="ov-scope" className={styles.heading}>
              Scope
            </h3>
            <div className={styles.scope}>
              {board.scope.includes.length > 0 && (
                <div>
                  <h4 className={styles.sub}>Covers</h4>
                  <ul className={styles.bullets}>
                    {board.scope.includes.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {board.scope.excludes.length > 0 && (
                <div>
                  <h4 className={styles.sub}>Does not cover</h4>
                  <ul className={styles.bullets}>
                    {board.scope.excludes.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {questionTotal > 0 && (
          <section className={styles.section} aria-labelledby="ov-questions" data-section="questions">
            <h3 id="ov-questions" className={styles.heading}>
              Open questions <span className={styles.count}>{questionTotal}</span>
            </h3>
            {(['question', 'unknown', 'assumption'] as const).map((kind) => {
              const items = boardItems.filter((i) => i.kind === kind)
              if (items.length === 0) return null
              return (
                <div key={kind}>
                  <h4 className={styles.sub}>{ITEM_LABEL[kind]}s</h4>
                  <ul className={styles.bullets}>
                    {items.map((i) => (
                      <li key={i.id}>{i.text}</li>
                    ))}
                  </ul>
                </div>
              )
            })}
            {partItems > 0 && (
              <button type="button" className={styles.more} data-row="questions:parts" onClick={() => filterParts('questions')}>
                {boardItems.length > 0 ? `${partItems} more on parts` : `${partItems} on parts`}
              </button>
            )}
          </section>
        )}
      </div>
      {lesson && (
        <LessonDialog
          lessonId={lesson.id}
          onClose={() => {
            const row = lesson.row
            setLesson(undefined)
            requestAnimationFrame(() => [...(page.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])].find((r) => r.dataset.row === row)?.focus())
          }}
        />
      )}
    </div>
  )
}
