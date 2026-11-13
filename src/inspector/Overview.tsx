import { useContext } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppDispatch, useAppStore } from '../app/store'
import { PlayOriginContext } from '../scenarios/focus'
import type { Board } from '../board/schema'
import { SourceBadge } from '../app/SourceBadge'
import { NotesSection } from '../notes/NotesSection'
import { NotesToReview, WhatChanged } from '../notes/Review'
import { usePanel } from './panelContext'
import { BulletList, Heading, ItemGroups, Section } from './parts'
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

      {board.scope.includes.length > 0 && (
        <Section title="Covers">
          <BulletList items={board.scope.includes} />
        </Section>
      )}
      {board.scope.excludes.length > 0 && (
        <Section title="Does not cover">
          <BulletList items={board.scope.excludes} />
        </Section>
      )}

      <ItemGroups items={boardItems} />

      <NotesSection target={{ type: 'board' }} />

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
                  Play
                </button>
              </li>
            ))}
          </ul>
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
                <SourceBadge kind={c.source.kind} />
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
                      {names.get(r.from) ?? r.from} <span aria-hidden="true">{'→'}</span>
                      <span className="sr-only"> to </span> {names.get(r.to) ?? r.to}
                    </span>
                    <span className={styles.rowMeta}>{r.kind === 'unknown' ? `? ${r.label}` : r.label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}
