import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import buttons from '../app/buttons.module.css'
import rowsCss from '../app/rows.module.css'
import { useAppDispatch, useAppStore, useAppStoreApi } from '../app/store'
import { useUiApi } from '../app/ui'
import type { Board } from '../board/schema'
import type { BoardDiff } from '../layer/diff'
import { type ArchiveEntry, type Item, type Layer, type Reconnect } from '../layer/model'
import { revisionSummary, summaryLine } from '../layer/revisionSummary'
import { summarizeLayer } from '../layer/status'
import { adoptedNow, hasChanges, pendingAnswers, reviewCounts, selectionOf } from '../notes/review'
import { deletedToast } from '../notes/undoToast'
import { StatusGlyph, StatusWord } from '../status/StatusGlyph'
import type { ItemState } from '../status/state'
import { answerFor } from './answers'
import { Group, SubHead } from './bits'
import { partName } from './names'
import { AgentAnswer, NoteBlock } from './notes'
import notes from './notes.module.css'
import { usePanel } from './panelContext'
import { Picker } from './Picker'
import { partItems } from './pickerItems'
import { spotOf, spotProps } from './spotlight'
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

function ItemRow({
  board,
  layer,
  entry,
  status,
  live = true,
  reviewId,
}: { board: Board; layer: Layer; entry: Item; status?: ItemState; live?: boolean; reviewId?: string }) {
  const { choose } = usePanel()
  const content = (
    <>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{itemWords(board, layer, entry)}</span>
      </span>
      {status && (
        <span className={styles.rowEnd}>
          <StatusWord state={status} />
        </span>
      )}
    </>
  )
  if (!live) return <p className={clsx(rowsCss.row, rowsCss.sm, styles.staticRow)}>{content}</p>
  return (
    <button
      type="button"
      className={clsx(rowsCss.row, rowsCss.sm)}
      data-review-item={reviewId}
      onClick={() => choose(selectionOf(entry))}
      {...spotProps(spotOf(selectionOf(entry)))}
    >
      {content}
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
      <p className={notes.stateLine} data-plain={!landed || undefined}>
        {landed && <StatusGlyph state="adopted" withWord />}
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
    <li className={notes.feedItem}>
      <ItemRow board={board} layer={layer} entry={item} status={entry.response.status} live={false} />
      {entry.type === 'reconnect' && <ReconnectOutcome board={board} previous={previous} layer={layer} reconnect={entry.item} />}
      <AgentAnswer board={board} answer={entry.response} bare />
      <div className={notes.feedActions}>
        <button
          type="button"
          className={clsx(buttons.button, buttons.link, buttons.small, notes.textAction)}
          onClick={() => dispatch({ type: 'archiveRestored', id: entry.item.id })}
        >
          Restore
        </button>
        {deletable && (
          <button
            type="button"
            className={clsx(buttons.button, buttons.link, buttons.small, notes.textAction)}
            data-tone="danger"
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

/**
 * One answer that waits for a decision: the user's words, the agent's answer, and the three ways to settle it.
 * Keep leaves both on the map, Dismiss archives them, and Reply writes a follow-up where the item lives.
 */
function PendingItem({ board, previous, layer, entry }: { board: Board; previous: Board | undefined; layer: Layer; entry: Item }) {
  const dispatch = useAppDispatch()
  const ui = useUiApi()
  const answer = answerFor(layer, entry.item.id)
  if (!answer) return null

  function reply() {
    const selection = selectionOf(entry)
    dispatch({ type: 'select', selection })
    ui.setTab('details')
    // The view of the item comes up first; then the note field on it takes the words.
    if (entry.type === 'note') requestAnimationFrame(() => ui.askComposer({ text: entry.item.text, kind: entry.item.kind }))
    else if (entry.type === 'reconnect') requestAnimationFrame(() => ui.askComposer())
  }

  return (
    <li className={notes.feedItem} data-review-item={entry.item.id}>
      <ItemRow board={board} layer={layer} entry={entry} status={answer.status} reviewId={entry.item.id} />
      {entry.type === 'reconnect' && <ReconnectOutcome board={board} previous={previous} layer={layer} reconnect={entry.item} />}
      <AgentAnswer board={board} answer={answer} bare />
      <div className={notes.feedActions}>
        <button type="button" className={clsx(buttons.button, buttons.link, buttons.small, notes.textAction)} onClick={() => dispatch({ type: 'answerKept', id: entry.item.id })}>
          Keep
        </button>
        <button
          type="button"
          className={clsx(buttons.button, buttons.link, buttons.small, notes.textAction)}
          onClick={() => dispatch({ type: 'itemsArchived', answers: [{ id: entry.item.id, response: answer }], now: new Date() })}
        >
          Dismiss
        </button>
        <button type="button" className={clsx(buttons.button, buttons.link, buttons.small, notes.textAction)} onClick={reply}>
          Reply
        </button>
      </div>
    </li>
  )
}

function Answers({ board, previous, layer }: { board: Board; previous: Board | undefined; layer: Layer }) {
  const pending = pendingAnswers(layer)
  const adopted = adoptedNow(board, layer)
  if (pending.length + adopted.length === 0) return null
  return (
    <Group name="answers" title="Answers" count={pending.length + adopted.length}>
      <ul className={notes.feed}>
        {pending.map((entry) => (
          <PendingItem key={entry.item.id} board={board} previous={previous} layer={layer} entry={entry} />
        ))}
        {adopted.map((entry) => (
          <ArchivedItem key={entry.item.id} board={board} previous={previous} layer={layer} entry={entry} />
        ))}
      </ul>
    </Group>
  )
}

/** Everything archived before this revision's answers: dismissed items and earlier adoptions. Closed, and restorable. */
function Archive({ board, previous, layer }: { board: Board; previous: Board | undefined; layer: Layer }) {
  const now = new Set(adoptedNow(board, layer))
  const older = layer.archive.filter((e) => !now.has(e)).reverse()
  if (older.length === 0) return null
  return (
    <Group name="archive" title="Archive" count={older.length} defaultOpen={false}>
      <ul className={notes.feed}>
        {older.map((entry) => (
          <ArchivedItem key={entry.item.id} board={board} previous={previous} layer={layer} entry={entry} deletable />
        ))}
      </ul>
    </Group>
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
    <Group name="relinking" title="Needs relinking" count={count}>
      {needsRelinking.length > 0 && (
        <ul className={notes.list}>
          {needsRelinking.map((note) => (
            <NoteBlock key={note.id} note={note} board={board} />
          ))}
        </ul>
      )}
      {brokenLinks.length > 0 && (
        <ul className={notes.feed}>
          {brokenLinks.map((link) => {
            const missing = ids.has(link.from) ? 'to' : 'from'
            return (
              <li key={link.id} className={notes.feedItem}>
                <button type="button" className={clsx(rowsCss.row, rowsCss.sm, styles.multiRow)} onClick={() => choose({ type: 'link', id: link.id })}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{link.label || 'Link'}</span>
                    <span className={styles.rowMeta}>
                      {partName(was, link.from, layer.proposals) ?? link.from} to {partName(was, link.to, layer.proposals) ?? link.to}
                    </span>
                  </span>
                </button>
                <div className={notes.state}>
                  <p className={notes.stateLine} data-tone="danger">
                    <StatusGlyph state="relinking" withWord />
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
      )}
    </Group>
  )
}

function Changes({ board, previous, changes }: { board: Board; previous: Board | undefined; changes: BoardDiff }) {
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
    <Group name="changes" title={`Changed in revision ${board.revision}`}>
      {changes.boardChanged && <p className={styles.empty}>The title, goal, or scope changed.</p>}
      {groups.map((g) =>
        g.parts.length + g.lines.length === 0 ? null : (
          <div key={g.title}>
            <SubHead>
              {g.title} {g.parts.length + g.lines.length}
            </SubHead>
            <ul className={styles.rows}>
              {g.parts.map((id) => (
                <li key={`c-${id}`}>
                  {g.removed ? (
                    <span className={clsx(rowsCss.row, rowsCss.sm, styles.staticRow, styles.gone)}>{names(was, id)}</span>
                  ) : (
                    <button type="button" className={clsx(rowsCss.row, rowsCss.sm)} onClick={() => choose({ type: 'component', id })} {...spotProps({ parts: [id] })}>
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
                      <span className={clsx(rowsCss.row, rowsCss.sm, styles.staticRow, styles.gone)}>{line(was, id)}</span>
                    ) : (
                      <button
                        type="button"
                        className={clsx(rowsCss.row, rowsCss.sm, styles.multiRow)}
                        onClick={() => choose({ type: 'relationship', id })}
                        {...spotProps({ edges: [id] })}
                      >
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
    </Group>
  )
}

/** Everything that needs a look after a new revision: answers, broken notes and links, and what changed. */
export function Review() {
  const { board, layer, previous, changes } = useAppStore(useShallow((s) => ({ board: s.board, layer: s.layer, previous: s.previousBoard, changes: s.changes })))
  if (!board || !layer) return null
  const outdated = summarizeLayer(board, layer).outdated
  // The same sentence as the banner. Once the changes are marked reviewed, only the answers are left to count.
  const line = summaryLine(revisionSummary(hasChanges(changes) ? previous : undefined, board, layer.sent)) ?? `Revision ${board.revision} is open.`
  return (
    <div className={styles.view}>
      <p className={styles.summary}>{line}</p>
      <Answers board={board} previous={previous} layer={layer} />
      <NeedsRelinking board={board} layer={layer} previous={previous} />
      {outdated.length > 0 && (
        <Group name="outdated" title="Possibly outdated" count={outdated.length}>
          <ul className={notes.list}>
            {outdated.map((note) => (
              <NoteBlock key={note.id} note={note} board={board} showTarget />
            ))}
          </ul>
        </Group>
      )}
      {hasChanges(changes) && <Changes board={board} previous={previous} changes={changes} />}
      <Archive board={board} previous={previous} layer={layer} />
    </div>
  )
}

/** The pinned end of the review: how many items need a decision, and the one action that marks the changes as seen. */
export function ReviewFooter() {
  const dispatch = useAppDispatch()
  const { board, layer, changes } = useAppStore(useShallow((s) => ({ board: s.board, layer: s.layer, changes: s.changes })))
  if (!hasChanges(changes)) return null
  const { decisions } = reviewCounts(board, layer, changes)
  return (
    <div className={notes.footer}>
      {decisions > 0 && <span className={notes.footerText}>{decisions} to review</span>}
      <button type="button" className={clsx(buttons.button, buttons.primary, buttons.small, notes.footerAction)} onClick={() => dispatch({ type: 'changesDismissed' })}>
        Mark reviewed
      </button>
    </div>
  )
}
