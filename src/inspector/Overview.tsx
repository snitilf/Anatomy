import { useContext } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppDispatch, useAppStore } from '../app/store'
import { PlayOriginContext } from '../scenarios/focus'
import type { Board } from '../board/schema'
import { ArrowRight, Play } from 'lucide-react'
import { SourceNote } from '../app/SourceNote'
import { NotesSection } from '../notes/NotesSection'
import { NotesToReview, WhatChanged } from '../notes/Review'
import { usePanel } from './panelContext'
import { ConnectionLabel, Heading, OpenItems, Section, ShortList } from './parts'
import styles from './parts.module.css'

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

export function Overview({ board }: { board: Board }) {
  const { changes, previousBoard } = useAppStore(useShallow((s) => ({ changes: s.changes, previousBoard: s.previousBoard })))
  const { choose } = usePanel()
  const dispatch = useAppDispatch()
  const origin = useContext(PlayOriginContext)
  const names = new Map(board.components.map((c) => [c.id, c.label]))
  const groupName = new Map(board.groups.map((g) => [g.id, g.label]))
  const boardItems = board.items.filter((i) => i.about === undefined)

  const diff = changes
  const hasChanges =
    diff !== undefined &&
    (diff.boardChanged ||
      [diff.added, diff.removed, diff.changed].some((c) => c.components.length + c.relationships.length > 0))

  return (
    <>
      <Heading>{board.title}</Heading>
      <p className={styles.lead}>{board.goal}</p>

      {hasChanges && diff && <WhatChanged board={board} previous={previousBoard} changes={diff} />}
      <NotesToReview board={board} previous={previousBoard} />

      {board.scenarios.length > 0 && (
        <Section title="Walkthroughs">
          <ul className={styles.plain}>
            {board.scenarios.map((scenario) => (
              <li key={scenario.id} className={styles.walk}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{scenario.title}</span>
                  {scenario.summary && <span className={styles.rowMeta}>{scenario.summary}</span>}
                  <span className={styles.rowMeta}>{plural(scenario.steps.length, 'step', 'steps')}</span>
                </span>
                <button
                  type="button"
                  className={styles.play}
                  aria-label={`Play ${scenario.title}`}
                  onClick={(event) => {
                    origin.current = event.currentTarget
                    dispatch({ type: 'scenarioStarted', id: scenario.id })
                  }}
                >
                  <Play size={14} strokeWidth={1.5} aria-hidden="true" />
                  Play
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {board.scope.includes.length > 0 && (
        <Section title="Covers">
          <ShortList items={board.scope.includes} />
        </Section>
      )}
      {board.scope.excludes.length > 0 && (
        <Section title="Does not cover">
          <ShortList items={board.scope.excludes} />
        </Section>
      )}

      <Section title={`Parts (${board.components.length})`}>
        <ul className={styles.plain}>
          {board.components.map((c) => (
            <li key={c.id}>
              <button type="button" className={styles.row} onClick={() => choose({ type: 'component', id: c.id })}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{c.label}</span>
                  {c.group && groupName.get(c.group) && <span className={styles.rowMeta}>{groupName.get(c.group)}</span>}
                </span>
                {c.source.kind !== 'agent-explanation' && <SourceNote kind={c.source.kind} className={styles.rowSource} iconOnly />}
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {board.relationships.length > 0 && (
        <Section title={`Connections (${board.relationships.length})`}>
          <ul className={styles.plain}>
            {board.relationships.map((r) => (
              <li key={r.id}>
                <button type="button" className={styles.row} onClick={() => choose({ type: 'relationship', id: r.id })}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>
                      {names.get(r.from) ?? r.from}
                      <ArrowRight className={styles.inlineArrow} size={14} strokeWidth={1.5} aria-hidden="true" />
                      <span className="sr-only"> to </span>
                      {names.get(r.to) ?? r.to}
                    </span>
                    <span className={styles.rowMeta}>
                      <ConnectionLabel relationship={r} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <OpenItems items={boardItems} />
      <NotesSection target={{ type: 'board' }} />
    </>
  )
}
