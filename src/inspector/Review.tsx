import clsx from 'clsx'
import { ArrowRight, CircleCheck, CircleDashed, Unlink } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import buttons from '../app/buttons.module.css'
import { useAppDispatch, useAppStore, useAppStoreApi } from '../app/store'
import type { Selection } from '../app/state'
import type { Board } from '../board/schema'
import type { BoardDiff } from '../layer/diff'
import { itemsOf, type ArchiveEntry, type Item, type Layer, type Reconnect } from '../layer/model'
import { summarizeLayer } from '../layer/status'
import { adoptedNow, hasChanges } from '../notes/review'
import { deletedToast } from '../notes/undoToast'
import { answerFor } from './answers'
import { Disclosure, Section } from './bits'
import { partName } from './names'
import { AgentAnswer, ItemAnswer, NoteBlock } from './notes'
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

function ItemRow({ board, layer, entry, live = true }: { board: Board; layer: Layer; entry: Item; live?: boolean }) {
  const { choose } = usePanel()
  if (!live) {
    return (
      <p className={clsx(styles.row, styles.yours)}>
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{itemWords(board, layer, entry)}</span>
        </span>
      </p>
    )
  }
  return (
    <button type="button" className={clsx(styles.row, styles.yours)} onClick={() => choose(selectionOf(entry))}>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{itemWords(board, layer, entry)}</span>
      </span>
    </button>
  )
}

/**
 * A moved connection, before and after: where the agent drew it, where the user asked for it, and whether this revision
 * has a connection between the parts the user asked for.
 */
function ReconnectOutcome({ board, previous, layer, reconnect }: { board: Board; previous: Board | undefined; layer: Layer; reconnect: Reconnect }) {
  const was = previous?.relationships.find((r) => r.id === reconnect.relationshipId) ?? board.relationships.find((r) => r.id === reconnect.relationshipId)
  if (!was) return null
  const name = (id: string) => partName(board, id, layer.proposals) ?? (previous && partName(previous, id)) ?? id
  const from = reconnect.from ?? was.from
  const to = reconnect.to ?? was.to
  const landed = board.relationships.some((r) => r.from === from && r.to === to)
  const Icon = landed ? CircleCheck : CircleDashed
  return (
    <div className={notes.state}>
      <p className={notes.route}>
        <s>
          {name(was.from)} to {name(was.to)}
        </s>
        <ArrowRight className={styles.inlineArrow} size={12} strokeWidth={1.5} aria-hidden="true" />
        <span className="sr-only"> asked for </span>
        {name(from)} to {name(to)}
      </p>
      <p className={notes.stateLine}>
        <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
        <span>{landed ? `On the board in revision ${board.revision}.` : 'Not on the board.'}</span>
      </p>
    </div>
  )
}

/** An item that left the map, with the answer it left with, and the way back. */
function ArchivedItem({ board, previous, layer, entry, deletable = false }: { board: Board; previous: Board | undefined; layer: Layer; entry: ArchiveEntry; deletable?: boolean }) {
  const dispatch = useAppDispatch()
  const store = useAppStoreApi()
  const item = { type: entry.type, item: entry.item } as Item
  return (
    <li className={notes.item}>
      <ItemRow board={board} layer={layer} entry={item} live={false} />
      {entry.type === 'reconnect' && <ReconnectOutcome board={board} previous={previous} layer={layer} reconnect={entry.item} />}
      <AgentAnswer board={board} answer={entry.response} />
      <div className={notes.stateActions}>
        <button type="button" className={clsx(buttons.button, buttons.small)} onClick={() => dispatch({ type: 'archiveRestored', id: entry.item.id })}>
          Restore
        </button>
        {deletable && (
          <button
            type="button"
            className={clsx(buttons.button, buttons.quiet, buttons.small)}
            onClick={() => {
              dispatch({ type: 'archiveDropped', id: entry.item.id })
              deletedToast('Deleted from the archive', dispatch, store)
            }}
          >
            Delete
          </button>
        )}
      </div>
    </li>
  )
}

function Answers({ board, previous, layer }: { board: Board; previous: Board | undefined; layer: Layer }) {
  const answered = itemsOf(layer).filter((e) => answerFor(layer, e.item.id))
  const adopted = adoptedNow(board, layer)
  if (answered.length + adopted.length === 0) return null
  return (
    <Section title="Answers" count={answered.length + adopted.length}>
      <ul className={notes.list}>
        {answered.map((entry) => (
          <li key={entry.item.id} className={notes.item}>
            <ItemRow board={board} layer={layer} entry={entry} />
            {entry.type === 'reconnect' && <ReconnectOutcome board={board} previous={previous} layer={layer} reconnect={entry.item} />}
            <ItemAnswer board={board} id={entry.item.id} />
          </li>
        ))}
        {adopted.map((entry) => (
          <ArchivedItem key={entry.item.id} board={board} previous={previous} layer={layer} entry={entry} />
        ))}
      </ul>
    </Section>
  )
}

/** Everything archived before this revision's answers: dismissed items and earlier adoptions. Closed, and restorable. */
function Archive({ board, previous, layer }: { board: Board; previous: Board | undefined; layer: Layer }) {
  const now = new Set(adoptedNow(board, layer))
  const older = layer.archive.filter((e) => !now.has(e)).reverse()
  if (older.length === 0) return null
  return (
    <Disclosure title="Archive" count={older.length}>
      <ul className={notes.list}>
        {older.map((entry) => (
          <ArchivedItem key={entry.item.id} board={board} previous={previous} layer={layer} entry={entry} deletable />
        ))}
      </ul>
    </Disclosure>
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
                            <span className={clsx(styles.rowMeta, styles.wraps)}>
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
      <Answers board={board} previous={previous} layer={layer} />
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
      <Archive board={board} previous={previous} layer={layer} />
    </div>
  )
}

