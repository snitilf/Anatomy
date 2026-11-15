import clsx from 'clsx'
import { CircleCheck, CircleHelp, CircleX, History, MessageSquareReply, Pencil, StickyNote, Trash2, Unlink } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import buttons from '../app/buttons.module.css'
import { useAppDispatch, useAppStore, useAppStoreApi } from '../app/store'
import { Tip } from '../app/Tip'
import { useUi } from '../app/ui'
import type { Board } from '../board/schema'
import { changedFields } from '../layer/diff'
import { newId } from '../layer/edits'
import { LAYER_LIMITS, type Note, type NoteStatus, type Response, type Target } from '../layer/model'
import { noteStatus, wasSent } from '../layer/status'
import { sameTarget, targetName } from '../notes/targets'
import { deletedToast } from '../notes/undoToast'
import { answerFor, targetItems } from './answers'
import { PartLink, Section } from './bits'
import { partName, shortDate } from './names'
import styles from './notes.module.css'
import { usePanel } from './panelContext'
import { Picker } from './Picker'


const ANSWER = {
  adopted: { label: 'Adopted', icon: CircleCheck },
  declined: { label: 'Declined', icon: CircleX },
  answered: { label: 'Answered', icon: MessageSquareReply },
} as const

/**
 * The agent's answer to one of the user's items. The agent wrote it, so it is neutral: never the color of the user's own work.
 * `onDismiss` puts the item and its answer in the archive.
 */
export function AgentAnswer({ board, answer, onDismiss }: { board: Board; answer: Response; onDismiss?: (() => void) | undefined }) {
  const { label, icon: Icon } = ANSWER[answer.status]
  return (
    <div className={styles.answer}>
      <p className={styles.answerHead}>
        <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
        {label}
      </p>
      {answer.text !== '' && <p className={styles.answerText}>{answer.text}</p>}
      {answer.status === 'adopted' && answer.changed.length > 0 && (
        <p className={styles.answerChanged}>
          Changed:{' '}
          {answer.changed.map((id, i) => (
            <span key={id}>
              {i > 0 && ', '}
              <PartLink id={id} name={partName(board, id) ?? board.relationships.find((r) => r.id === id)?.label} />
            </span>
          ))}
        </p>
      )}
      {onDismiss && (
        <div className={styles.answerActions}>
          <button type="button" className={clsx(buttons.button, buttons.quiet, buttons.small)} onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

/** The answer to an item still on the map, with Dismiss. Nothing when the agent has not answered it. */
export function ItemAnswer({ board, id }: { board: Board; id: string }) {
  const dispatch = useAppDispatch()
  const answer = useAppStore((s) => answerFor(s.layer, id))
  if (!answer) return null
  return <AgentAnswer board={board} answer={answer} onDismiss={() => dispatch({ type: 'itemsArchived', answers: [{ id, response: answer }], now: new Date() })} />
}

function decode(value: string): Target {
  if (value === 'board') return { type: 'board' }
  const [type, id = ''] = value.split(':') as ['component' | 'relationship', string]
  return { type, id }
}

/** Where the note stands against the open revision: a neutral history line, or a danger line when its target left. */
function StatusLine({ note, status, board, onEdit }: { note: Note; status: Exclude<NoteStatus, 'current'>; board: Board; onEdit: () => void }) {
  const dispatch = useAppDispatch()
  const store = useAppStoreApi()
  const previous = useAppStore((s) => s.previousBoard)
  const was = previous ?? board
  if (status === 'possibly-outdated') {
    const fields = previous ? changedFields(previous, board, note.target) : []
    return (
      <div className={styles.state}>
        <p className={styles.stateLine}>
          <History size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>
            {targetName(board, note.target)} changed after you wrote this{fields.length > 0 ? `: ${fields.join(', ')}` : ''}.
          </span>
        </p>
        <div className={styles.stateActions}>
          <button type="button" className={clsx(buttons.button, buttons.small)} onClick={() => dispatch({ type: 'noteConfirmed', id: note.id, now: new Date() })}>
            Still true
          </button>
          <button type="button" className={clsx(buttons.button, buttons.quiet, buttons.small)} onClick={onEdit}>
            Edit
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className={styles.state}>
      <p className={styles.stateLine} data-tone="danger">
        <Unlink size={14} strokeWidth={1.5} aria-hidden="true" />
        <span>{targetName(was, note.target)} was removed.</span>
      </p>
      <div className={styles.stateActions}>
        <Picker
          label="Attach to"
          trigger="Attach to"
          placeholder="Search parts and connections"
          items={targetItems(board)}
          onPick={(value) => dispatch({ type: 'noteRelinked', id: note.id, target: decode(value), now: new Date() })}
        />
        <button
          type="button"
          className={clsx(buttons.button, buttons.quiet, buttons.small)}
          onClick={() => {
            dispatch({ type: 'noteDeleted', id: note.id })
            deletedToast(note.kind === 'note' ? 'Note deleted' : 'Question deleted', dispatch, store)
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

/** A note's words, held to six lines with a button that shows the rest. */
function NoteText({ text }: { text: string }) {
  const el = useRef<HTMLParagraphElement>(null)
  const [long, setLong] = useState(false)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => {
    const p = el.current
    if (!p || open) return
    const measure = () => setLong(p.scrollHeight > p.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(p)
    return () => observer.disconnect()
  }, [text, open])
  return (
    <>
      <p ref={el} className={styles.text} data-clamped={!open || undefined}>
        {text}
      </p>
      {long && (
        <button type="button" className={styles.more} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  )
}

/** One note or question: a block in the user's color, with its state and the agent's answer under it. */
export function NoteBlock({ note, board, showTarget = false }: { note: Note; board: Board; showTarget?: boolean }) {
  const dispatch = useAppDispatch()
  const store = useAppStoreApi()
  const sent = useAppStore((s) => (s.layer ? wasSent(s.layer, note) : false))
  const { choose } = usePanel()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.text)
  const status = noteStatus(board, note)
  const Icon = note.kind === 'note' ? StickyNote : CircleHelp
  const kind = note.kind === 'note' ? 'Note' : 'Question'

  function save() {
    const text = draft.trim()
    if (text.length === 0) return
    if (text !== note.text) dispatch({ type: 'noteEdited', id: note.id, text, now: new Date() })
    setEditing(false)
  }

  return (
    <li className={styles.item} data-status={status} data-yours="">
      <div className={styles.note}>
        <Icon className={styles.icon} size={14} strokeWidth={1.5} aria-hidden="true" />
        <span className="sr-only">{kind}: </span>
        <div className={styles.body}>
          {editing ? (
            <div className={styles.editor}>
              <textarea
                className={styles.textarea}
                name="note-edit"
                aria-label={`Edit ${kind.toLowerCase()}`}
                value={draft}
                maxLength={LAYER_LIMITS.noteText}
                rows={3}
                autoFocus
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    save()
                  } else if (event.key === 'Escape') {
                    event.stopPropagation()
                    setEditing(false)
                  }
                }}
              />
              <div className={styles.editorActions}>
                <button type="button" className={clsx(buttons.button, buttons.small)} disabled={draft.trim().length === 0} onClick={save}>
                  Save
                </button>
                <button type="button" className={clsx(buttons.button, buttons.quiet, buttons.small)} onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <NoteText text={note.text} />
          )}
          <div className={styles.meta}>
            {showTarget && note.target.type !== 'board' && (
              <>
                <button type="button" className={styles.on} onClick={() => choose(note.target as { type: 'component' | 'relationship'; id: string })}>
                  {targetName(board, note.target)}
                </button>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{shortDate(note.updatedAt)}</span>
            {sent && (
              <>
                <span aria-hidden="true">·</span>
                <span>Sent</span>
              </>
            )}
            {!editing && (
              <div className={styles.tools}>
                <Tip label="Edit">
                  <button
                    type="button"
                    className={styles.tool}
                    aria-label={`Edit ${kind.toLowerCase()}`}
                    onClick={() => {
                      setDraft(note.text)
                      setEditing(true)
                    }}
                  >
                    <Pencil size={14} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </Tip>
                <Tip label="Delete">
                  <button
                    type="button"
                    className={styles.tool}
                    aria-label={`Delete ${kind.toLowerCase()}`}
                    onClick={() => {
                      dispatch({ type: 'noteDeleted', id: note.id })
                      deletedToast(`${kind} deleted`, dispatch, store)
                    }}
                  >
                    <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </Tip>
              </div>
            )}
          </div>
        </div>
      </div>
      {status !== 'current' && (
        <StatusLine
          note={note}
          status={status}
          board={board}
          onEdit={() => {
            setDraft(note.text)
            setEditing(true)
          }}
        />
      )}
      <ItemAnswer board={board} id={note.id} />
    </li>
  )
}

/** One field to write a note or a question. Cmd or Ctrl with Enter adds it, and C focuses it from anywhere. */
export function Composer({ target }: { target: Target }) {
  const dispatch = useAppDispatch()
  const name = useId()
  const field = useRef<HTMLTextAreaElement>(null)
  const [kind, setKind] = useState<Note['kind']>('note')
  const [text, setText] = useState('')
  const asked = useUi((u) => u.composer)
  const seen = useRef(asked)
  useEffect(() => {
    if (asked === seen.current) return
    seen.current = asked
    field.current?.focus()
    field.current?.scrollIntoView?.({ block: 'nearest' })
  }, [asked])
  const empty = text.trim().length === 0

  function submit() {
    if (empty) return
    dispatch({ type: 'noteAdded', kind, text: text.trim(), target, id: newId('note'), now: new Date() })
    setText('')
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <textarea
        ref={field}
        className={styles.textarea}
        name="note-text"
        aria-label={kind === 'note' ? 'Add a note' : 'Add a question'}
        placeholder={kind === 'note' ? 'Add a note' : 'Add a question'}
        value={text}
        maxLength={LAYER_LIMITS.noteText}
        rows={2}
        data-composer=""
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            submit()
          } else if (event.key === 'Escape') {
            event.currentTarget.blur()
          }
        }}
      />
      <div className={styles.composerFoot}>
        <div className={styles.switch} role="radiogroup" aria-label="Kind">
          {(['note', 'question'] as const).map((k) => (
            <label key={k} className={styles.option}>
              <input type="radio" name={name} className={styles.radio} checked={kind === k} onChange={() => setKind(k)} />
              <span className={styles.face}>{k === 'note' ? 'Note' : 'Question'}</span>
            </label>
          ))}
        </div>
        {text.length >= LAYER_LIMITS.noteText - 200 && (
          <span className={styles.counter} role="status">
            {text.length} of {LAYER_LIMITS.noteText}
          </span>
        )}
        <button type="submit" className={clsx(buttons.button, buttons.small)} disabled={empty}>
          Add
        </button>
      </div>
    </form>
  )
}

/** The notes on one target, and the composer. */
export function NotesSection({ target }: { target: Target }) {
  const { board, notes } = useAppStore(useShallow((s) => ({ board: s.board, notes: s.layer?.notes })))
  if (!board || !notes) return null
  const mine = notes.filter((n) => sameTarget(n.target, target))
  return (
    <Section title="Notes" count={mine.length > 0 ? mine.length : undefined}>
      {mine.length > 0 && (
        <ul className={styles.list}>
          {mine.map((note) => (
            <NoteBlock key={note.id} note={note} board={board} />
          ))}
        </ul>
      )}
      <Composer target={target} />
    </Section>
  )
}

