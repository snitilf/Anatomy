import clsx from 'clsx'
import { ArrowRight, GraduationCap, Play } from 'lucide-react'
import { useState } from 'react'
import buttons from '../app/buttons.module.css'
import rowStyles from '../app/rows.module.css'
import type { Board } from '../board/schema'
import { plural, startHereLessons } from './model'

export interface StartHereProps {
  board: Board
  onPlay: (scenarioId: string, rowKey: string) => void
  onOpenLesson: (lessonId: string, partId: string) => void
  /** Compact row height (--row-sm) for the sidebar; defaults to --row-md for the Overview. */
  compact?: boolean | undefined
  /** Optional cap on visible items (for example 5 in the sidebar), with a "Show all N" link. */
  limit?: number | undefined
  /** Optional class on the list wrapper (such as negative inline margins to align row text). */
  listClassName?: string | undefined
  /** Optional class on each row button. */
  rowClassName?: string | undefined
}

/**
 * Shared "Start here" list of walkthroughs and interactive lessons.
 * Used on the Overview page and ready for the sidebar board view.
 */
export function StartHere({ board, onPlay, onOpenLesson, compact = false, limit, listClassName, rowClassName }: StartHereProps) {
  const [expanded, setExpanded] = useState(false)
  const lessons = startHereLessons(board)
  type Entry =
    | { kind: 'walk'; id: string; title: string; steps: number }
    | { kind: 'lesson'; partId: string; partLabel: string; lessonId: string; title: string }

  const entries: Entry[] = [
    ...board.scenarios.map((s) => ({ kind: 'walk' as const, id: s.id, title: s.title, steps: s.steps.length })),
    ...lessons.map(({ part, lesson }) => ({ kind: 'lesson' as const, partId: part.id, partLabel: part.label, lessonId: lesson.id, title: lesson.title })),
  ]

  if (entries.length === 0) return null

  const capped = limit !== undefined && !expanded && entries.length > limit
  const shown = capped ? entries.slice(0, limit) : entries

  return (
    <>
      <ul className={listClassName} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', margin: 0, padding: 0, listStyle: 'none' }}>
        {shown.map((entry) =>
          entry.kind === 'walk' ? (
            <li key={`walk:${entry.id}`}>
              <button
                type="button"
                className={clsx(rowStyles.row, compact && rowStyles.sm, rowClassName)}
                data-row={`walk:${entry.id}`}
                aria-label={`Play ${entry.title}`}
                onClick={() => onPlay(entry.id, `walk:${entry.id}`)}
              >
                <Play className={rowStyles.icon} style={{ color: 'var(--accent-text)' }} size={14} strokeWidth={1.5} fill="currentColor" aria-hidden="true" />
                <span style={{ flex: 1, minWidth: 0 }}>{entry.title}</span>
                <span className={rowStyles.meta}>{plural(entry.steps, 'step', 'steps')}</span>
                <ArrowRight className={rowStyles.go} size={12} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </li>
          ) : (
            <li key={`lesson:${entry.partId}`}>
              <button
                type="button"
                className={clsx(rowStyles.row, compact && rowStyles.sm, rowClassName)}
                data-row={`lesson:${entry.partId}`}
                data-lesson-opener={entry.partId}
                onClick={() => onOpenLesson(entry.lessonId, entry.partId)}
              >
                <GraduationCap className={rowStyles.icon} size={14} strokeWidth={1.5} aria-hidden="true" />
                <span style={{ flex: 1, minWidth: 0 }}>{entry.title}</span>
                <span className={rowStyles.meta}>on {entry.partLabel}</span>
              </button>
            </li>
          ),
        )}
      </ul>
      {limit !== undefined && entries.length > limit && (
        <button
          type="button"
          className={clsx(buttons.button, buttons.link, buttons.small)}
          style={{ marginTop: 'var(--space-1)' }}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : `Show all ${entries.length}`}
        </button>
      )}
    </>
  )
}
