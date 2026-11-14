import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppDispatch, useAppStore } from '../app/store'
import type { Board } from '../board/schema'
import type { BoardDiff } from '../layer/diff'
import { summarizeLayer } from '../layer/status'
import { usePanel } from '../inspector/panelContext'
import { Section } from '../inspector/parts'
import { DeleteLink, RelinkLinkEnd } from './Links'
import { NoteCard, StillTrue } from './NoteCard'
import styles from './notes.module.css'
import { TargetSelect } from './TargetSelect'
import { targetName } from './targets'
import type { Note, Target } from '../layer/model'

function componentName(board: Board, id: string): string {
  return board.components.find((c) => c.id === id)?.label ?? id
}

function connectionName(board: Board, id: string): string {
  const r = board.relationships.find((x) => x.id === id)
  return r ? `${componentName(board, r.from)} to ${componentName(board, r.to)}: ${r.label}` : id
}

function ChangeGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.changeGroup}>
      <h4 className={styles.changeTitle}>{title}</h4>
      {children}
    </div>
  )
}

/** What the latest re-import added, removed, and changed. It stays until the user is done reviewing. */
export function WhatChanged({ board, previous, changes }: { board: Board; previous: Board | undefined; changes: BoardDiff }) {
  const dispatch = useAppDispatch()
  const { choose } = usePanel()
  const prev = previous ?? board
  const partButton = (id: string) => (
    <li key={`c-${id}`}>
      <button type="button" className={styles.changeButton} onClick={() => choose({ type: 'component', id })}>
        {componentName(board, id)}
      </button>
    </li>
  )
  const lineButton = (id: string) => (
    <li key={`r-${id}`}>
      <button type="button" className={styles.changeButton} onClick={() => choose({ type: 'relationship', id })}>
        {connectionName(board, id)}
      </button>
    </li>
  )
  const { added, changed, removed } = changes
  const removedCount = removed.components.length + removed.relationships.length
  return (
    <Section title="What changed">
      <div className={styles.changed}>
        {changes.boardChanged && <p className={styles.changeLine}>Board details changed</p>}
        {added.components.length + added.relationships.length > 0 && (
          <ChangeGroup title="Added">
            <ul className={styles.changeList}>
              {added.components.map(partButton)}
              {added.relationships.map(lineButton)}
            </ul>
          </ChangeGroup>
        )}
        {changed.components.length + changed.relationships.length > 0 && (
          <ChangeGroup title="Changed">
            <ul className={styles.changeList}>
              {changed.components.map(partButton)}
              {changed.relationships.map(lineButton)}
            </ul>
          </ChangeGroup>
        )}
        {removedCount > 0 && (
          <ChangeGroup title="Removed">
            <ul className={styles.changeList}>
              {removed.components.map((id) => (
                <li key={`c-${id}`} className={styles.removed}>
                  {componentName(prev, id)}
                </li>
              ))}
              {removed.relationships.map((id) => (
                <li key={`r-${id}`} className={styles.removed}>
                  {connectionName(prev, id)}
                </li>
              ))}
            </ul>
          </ChangeGroup>
        )}
        <div className={styles.row}>
          <button type="button" className={styles.solid} onClick={() => dispatch({ type: 'changesDismissed' })}>
            Done reviewing
          </button>
        </div>
      </div>
    </Section>
  )
}

function RelinkNote({ note, board }: { note: Note; board: Board }) {
  const dispatch = useAppDispatch()
  const [chosen, setChosen] = useState<Target | undefined>(undefined)
  return (
    <div className={styles.relink}>
      <TargetSelect board={board} label="Attach to" value={chosen} onChange={setChosen} />
      <button
        type="button"
        className={styles.solid}
        disabled={chosen === undefined}
        onClick={() => chosen && dispatch({ type: 'noteRelinked', id: note.id, target: chosen, now: new Date() })}
      >
        Attach
      </button>
    </div>
  )
}

/**
 * Notes that need a decision. Nothing here is changed by the app.
 * It stays while any note is outdated or homeless, even after the change list is cleared.
 */
export function NotesToReview({ board, previous }: { board: Board; previous: Board | undefined }) {
  const { notes, links, proposals } = useAppStore(useShallow((s) => ({ notes: s.layer?.notes, links: s.layer?.links, proposals: s.layer?.proposals })))
  const { choose } = usePanel()
  if (!notes || !links || !proposals) return null
  // Positions play no part here, so only the notes and links are read.
  const { outdated, needsRelinking, brokenLinks } = summarizeLayer(board, { notes, links, proposals })
  if (outdated.length + needsRelinking.length + brokenLinks.length === 0) return null
  const ids = new Set(board.components.map((c) => c.id))
  const was = previous ?? board
  return (
    <Section title="Notes to review">
      <div className={styles.review}>
        {outdated.length > 0 && (
          <ChangeGroup title="Possibly outdated">
            <ul className={styles.list}>
              {outdated.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  status="possibly-outdated"
                  context={
                    <p className={styles.on}>
                      On{' '}
                      <button type="button" className={styles.inline} onClick={() => choose(note.target.type === 'board' ? { type: 'board' } : note.target)}>
                        {targetName(board, note.target)}
                      </button>
                    </p>
                  }
                  actions={<StillTrue id={note.id} />}
                />
              ))}
            </ul>
          </ChangeGroup>
        )}
        {needsRelinking.length > 0 && (
          <ChangeGroup title="Needs relinking">
            <ul className={styles.list}>
              {needsRelinking.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  status="needs-relinking"
                  context={<p className={styles.on}>Was on {targetName(was, note.target)}, which was removed.</p>}
                  actions={<RelinkNote note={note} board={board} />}
                />
              ))}
            </ul>
          </ChangeGroup>
        )}
        {brokenLinks.length > 0 && (
          <ChangeGroup title="Links to fix">
            <ul className={styles.list}>
              {brokenLinks.map((link) => (
                <li key={link.id} className={styles.note} data-status="needs-relinking">
                  <p className={styles.text}>
                    Your link from {componentName(was, link.from)} to {componentName(was, link.to)}
                    {link.label !== '' && <>, "{link.label}"</>}, joins a part that was removed.
                  </p>
                  {!ids.has(link.from) && <RelinkLinkEnd link={link} end="from" board={board} />}
                  {!ids.has(link.to) && <RelinkLinkEnd link={link} end="to" board={board} />}
                  <div className={styles.row}>
                    <DeleteLink id={link.id} />
                  </div>
                </li>
              ))}
            </ul>
          </ChangeGroup>
        )}
      </div>
    </Section>
  )
}
