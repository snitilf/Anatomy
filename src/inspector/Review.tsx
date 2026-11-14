import clsx from 'clsx'
import { ArrowRight, Unlink } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import buttons from '../app/buttons.module.css'
import { useAppDispatch, useAppStore } from '../app/store'
import type { Selection } from '../app/state'
import type { Board } from '../board/schema'
import type { BoardDiff } from '../layer/diff'
import { itemsOf, type Item, type Layer } from '../layer/model'
import { summarizeLayer } from '../layer/status'
import { hasChanges } from '../notes/review'
import { deletedToast } from '../notes/undoToast'
import { answerFor } from './answers'
import { Section } from './bits'
import { partName } from './names'
import { AgentAnswer, NoteBlock } from './notes'
import notes from './notes.module.css'
import { usePanel } from './panelContext'
import { Picker } from './Picker'
import { partItems } from './pickerItems'
import styles from './view.module.css'

function itemWords(board: Board, layer: Layer, entry: Item): string {
  const name = (id: string) => partName(board, id, layer.proposals) ?? id
  switch (entry.type) {
    case 'note':
      return entry.item.text
    case 'link':
      return `${entry.item.label || 'Link'}: ${name(entry.item.from)} to ${name(entry.item.to)}`
    case 'proposal':
      return entry.item.label
    case 'mark':
      return entry.item.note ?? (entry.item.kind === 'text' || entry.item.kind === 'sticky' ? entry.item.text : 'Drawing')
    case 'reconnect':
      return board.relationships.find((r) => r.id === entry.item.relationshipId)?.label ?? entry.item.relationshipId
  }
}

/** Where an item sits, so a press on it selects that on the map. */
function selectionOf(entry: Item): Selection {
  switch (entry.type) {
    case 'note':
      return entry.item.target.type === 'board' ? { type: 'board' } : { type: entry.item.target.type, id: entry.item.target.id }
    case 'reconnect':
      return { type: 'relationship', id: entry.item.relationshipId }
    default:
      return { type: entry.type, id: entry.item.id }
  }
}

function ItemRow({ board, layer, entry }: { board: Board; layer: Layer; entry: Item }) {
  const { choose } = usePanel()
  return (
    <button type="button" className={clsx(styles.row, styles.yours)} onClick={() => choose(selectionOf(entry))}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{itemWords(board, layer, entry)}</span>
      </span>
    </button>
  )
}

function Answers({ board, layer }: { board: Board; layer: Layer }) {
  const dispatch = useAppDispatch()
  const answered = itemsOf(layer).filter((e) => answerFor(board, e.item.id))
  const adopted = layer.archive.filter((e) => e.response.status === 'adopted')
  if (answered.length + adopted.length === 0) return null
  return (
    <Section title="Answers" count={answered.length + adopted.length}>
      <ul className={notes.list}>
        {answered.map((entry) => {
          const answer = answerFor(board, entry.item.id)
          return (
            <li key={entry.item.id} className={notes.item}>
              <ItemRow board={board} layer={layer} entry={entry} />
              {answer && <AgentAnswer board={board} answer={answer} />}
            </li>
          )
        })}
        {adopted.map((entry) => (
          <li key={entry.item.id} className={notes.item}>
            <p className={clsx(styles.row, styles.yours)}>{itemWords(board, layer, { type: entry.type, item: entry.item } as Item)}</p>
            <AgentAnswer board={board} answer={{ feedbackId: entry.item.id, status: 'adopted', text: entry.response.text, changed: entry.response.changed }} />
            <div className={notes.stateActions}>
              <button type="button" className={clsx(buttons.button, buttons.small)} onClick={() => dispatch({ type: 'archiveRestored', id: entry.item.id })}>
                Restore
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function NeedsRelinking({ board, layer, previous }: { board: Board; layer: Layer; previous: Board | undefined }) {
  const dispatch = useAppDispatch()
  const { choose } = usePanel()
  const { needsRelinking, brokenLinks } = summarizeLayer(board, layer)
  const count = needsRelinking.length + brokenLinks.length
  if (count === 0) return null
  const was = previous ?? board
  const ids = new Set([...board.components.map((c) => c.id), ...layer.proposals.map((p) => p.id)])
  return (
    <Section title="Needs relinking" count={count}>
      <ul className={notes.list}>
        {needsRelinking.map((note) => (
          <NoteBlock key={note.id} note={note} board={board} />
        ))}
        {brokenLinks.map((link) => {
          const missing = ids.has(link.from) ? 'to' : 'from'
          return (
            <li key={link.id} className={notes.item}>
              <button type="button" className={clsx(styles.row, styles.yours)} onClick={() => choose({ type: 'link', id: link.id })}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{link.label || 'Link'}</span>
                  <span className={styles.rowMeta}>
                    {partName(was, link.from, layer.proposals) ?? link.from} to {partName(was, link.to, layer.proposals) ?? link.to}
                  </span>
                </span>
              </button>
              <div className={notes.state}>
                <p className={notes.stateLine} data-tone="danger">
                  <Unlink size={14} strokeWidth={1.5} aria-hidden="true" />
                  <span>{partName(was, link[missing]) ?? link[missing]} was removed.</span>
                </p>
                <div className={notes.stateActions}>
                  <Picker
                    label="Attach to"
                    trigger="Attach to"
                    items={partItems(board, layer.proposals, missing === 'from' ? link.to : link.from)}
                    onPick={(part) => dispatch({ type: 'linkEdited', id: link.id, change: { [missing]: part } })}
                  />
                  <button
                    type="button"
                    className={clsx(buttons.button, buttons.quiet, buttons.small)}
                    onClick={() => {
                      dispatch({ type: 'linkDeleted', id: link.id })
                      deletedToast('Link deleted', dispatch)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function Changes({ board, previous, changes }: { board: Board; previous: Board | undefined; changes: BoardDiff }) {
  const dispatch = useAppDispatch()
  const { choose } = usePanel()
  const was = previous ?? board
  const names = (b: Board, id: string) => b.components.find((c) => c.id === id)?.label ?? id
  const line = (b: Board, id: string) => {
    const r = b.relationships.find((x) => x.id === id)
    return r ? `${r.label}: ${names(b, r.from)} to ${names(b, r.to)}` : id
  }
  const groups = [
    { title: 'Added', parts: changes.added.components, lines: changes.added.relationships, removed: false },
    { title: 'Changed', parts: changes.changed.components, lines: changes.changed.relationships, removed: false },
    { title: 'Removed', parts: changes.removed.components, lines: changes.removed.relationships, removed: true },
  ]
  return (
    <Section title={`Changed in revision ${board.revision}`}>
      {changes.boardChanged && <p className={styles.empty}>The title, goal, or scope changed.</p>}
      {groups.map((g) =>
        g.parts.length + g.lines.length === 0 ? null : (
          <div key={g.title} className={styles.section}>
            <h4 className={styles.sectionHead}>
              {g.title}
              <span className={styles.count}>{g.parts.length + g.lines.length}</span>
            </h4>
            <ul className={styles.rows}>
              {g.parts.map((id) => (
                <li key={`c-${id}`}>
                  {g.removed ? (
                    <span className={clsx(styles.row, styles.gone)}>{names(was, id)}</span>
                  ) : (
                    <button type="button" className={styles.row} onClick={() => choose({ type: 'component', id })}>
                      <span className={styles.rowTitle}>{names(board, id)}</span>
                    </button>
                  )}
                </li>
              ))}
              {g.lines.map((id) => {
                const before = was.relationships.find((r) => r.id === id)
                const after = board.relationships.find((r) => r.id === id)
                const moved = before && after && (before.from !== after.from || before.to !== after.to)
                return (
                  <li key={`r-${id}`}>
                    {g.removed ? (
                      <span className={clsx(styles.row, styles.gone)}>{line(was, id)}</span>
                    ) : (
                      <button type="button" className={styles.row} onClick={() => choose({ type: 'relationship', id })}>
                        <span className={styles.rowMain}>
                          <span className={styles.rowTitle}>{after?.label ?? id}</span>
                          {moved && before && after ? (
                            <span className={styles.rowMeta}>
                              <s>
                                {names(was, before.from)} to {names(was, before.to)}
                              </s>
                              <ArrowRight className={styles.inlineArrow} size={12} strokeWidth={1.5} aria-hidden="true" />
                              <span className="sr-only"> now </span>
                              {names(board, after.from)} to {names(board, after.to)}
                            </span>
                          ) : (
                            after && (
                              <span className={styles.rowMeta}>
                                {names(board, after.from)} to {names(board, after.to)}
                              </span>
                            )
                          )}
                        </span>
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ),
      )}
      <div className={styles.actions}>
        <button type="button" className={clsx(buttons.button, buttons.small)} onClick={() => dispatch({ type: 'changesDismissed' })}>
          Done
        </button>
      </div>
    </Section>
  )
}

/** Everything that needs a look after a new revision: answers, broken notes and links, and what changed. */
export function Review() {
  const { board, layer, previous, changes } = useAppStore(useShallow((s) => ({ board: s.board, layer: s.layer, previous: s.previousBoard, changes: s.changes })))
  if (!board || !layer) return null
  const outdated = summarizeLayer(board, layer).outdated
  return (
    <div className={styles.view}>
      <Answers board={board} layer={layer} />
      <NeedsRelinking board={board} layer={layer} previous={previous} />
      {outdated.length > 0 && (
        <Section title="Possibly outdated" count={outdated.length}>
          <ul className={notes.list}>
            {outdated.map((note) => (
              <NoteBlock key={note.id} note={note} board={board} showTarget />
            ))}
          </ul>
        </Section>
      )}
      {hasChanges(changes) && <Changes board={board} previous={previous} changes={changes} />}
    </div>
  )
}

