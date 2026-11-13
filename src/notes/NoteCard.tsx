import { useState, type ReactNode } from 'react'
import { OVERLAY_LIMITS } from '../overlay/schema'
import type { Note, NoteStatus } from '../overlay/types'
import { useAppDispatch } from '../app/store'
import styles from './notes.module.css'
import { YouTag } from './YouTag'

const DATE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function when(note: Note): string {
  const edited = note.updatedAt !== note.createdAt
  const date = new Date(edited ? note.updatedAt : note.createdAt)
  return `${edited ? 'Edited' : 'Added'} ${Number.isNaN(date.getTime()) ? '' : DATE.format(date)}`.trim()
}

const STATUS_TAG: Record<Exclude<NoteStatus, 'current'>, string> = {
  'possibly-outdated': 'Possibly outdated',
  'needs-relinking': 'Needs relinking',
}

export function NoteCard({
  note,
  status,
  context,
  actions,
}: {
  note: Note
  status: NoteStatus
  /** Where the note is attached, when the list does not already say. */
  context?: ReactNode
  /** Buttons that belong to the note's state, before Edit and Delete. */
  actions?: ReactNode
}) {
  const dispatch = useAppDispatch()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.text)
  const [confirming, setConfirming] = useState(false)

  function save() {
    const text = draft.trim()
    if (text.length === 0) return
    dispatch({ type: 'noteEdited', id: note.id, text, now: new Date() })
    setEditing(false)
  }

  return (
    <li className={styles.note} data-kind={note.kind} data-status={status}>
      <div className={styles.tags}>
        <YouTag />
        <span className={styles.tag}>{note.kind === 'note' ? 'Note' : 'Question'}</span>
        {status !== 'current' && (
          <span className={styles.tag} data-warn="">
            {STATUS_TAG[status]}
          </span>
        )}
      </div>
      {context}
      {editing ? (
        <div className={styles.editor}>
          <textarea
            className={styles.textarea}
            aria-label={note.kind === 'note' ? 'Edit your note' : 'Edit your question'}
            value={draft}
            maxLength={OVERLAY_LIMITS.noteText}
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
          <div className={styles.row}>
            <button type="button" className={styles.solid} disabled={draft.trim().length === 0} onClick={save}>
              Save
            </button>
            <button type="button" className={styles.plain} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className={styles.text}>{note.text}</p>
          <p className={styles.meta}>{when(note)}</p>
          <div className={styles.row}>
            {actions}
            <button
              type="button"
              className={styles.plain}
              onClick={() => {
                setDraft(note.text)
                setEditing(true)
              }}
            >
              Edit
            </button>
            {confirming ? (
              <>
                <button type="button" className={styles.solid} onClick={() => dispatch({ type: 'noteDeleted', id: note.id })}>
                  Delete {note.kind}
                </button>
                <button type="button" className={styles.plain} onClick={() => setConfirming(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className={styles.plain} onClick={() => setConfirming(true)}>
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </li>
  )
}

/** The user says an outdated note still holds. It is checked against the board as it is now. */
export function StillTrue({ id }: { id: string }) {
  const dispatch = useAppDispatch()
  return (
    <button type="button" className={styles.plain} onClick={() => dispatch({ type: 'noteConfirmed', id, now: new Date() })}>
      Still true
    </button>
  )
}
