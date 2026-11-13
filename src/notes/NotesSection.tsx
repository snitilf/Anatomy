import { useId, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppDispatch, useAppStore } from '../app/store'
import { Disclosure } from '../inspector/parts'
import { newId } from '../overlay/notes'
import { OVERLAY_LIMITS } from '../overlay/schema'
import { noteStatus } from '../overlay/status'
import type { Note, Target } from '../overlay/types'
import { NoteCard, StillTrue } from './NoteCard'
import styles from './notes.module.css'
import { sameTarget } from './targets'

/** Near the limit, the form shows how many characters are left. */
const COUNTER_FROM = 1800

function NoteForm({ target }: { target: Target }) {
  const dispatch = useAppDispatch()
  const group = useId()
  const [kind, setKind] = useState<Note['kind']>('note')
  const [text, setText] = useState('')
  const empty = text.trim().length === 0

  function submit() {
    if (empty) return
    dispatch({ type: 'noteAdded', kind, text: text.trim(), target, id: newId('note'), now: new Date() })
    setText('')
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className={styles.kinds} role="radiogroup" aria-label="Kind">
        {(['note', 'question'] as const).map((k) => (
          <label key={k} className={styles.kind}>
            <input type="radio" name={group} className={styles.kindInput} checked={kind === k} onChange={() => setKind(k)} />
            <span className={styles.kindFace}>{k === 'note' ? 'Note' : 'Question'}</span>
          </label>
        ))}
      </div>
      <textarea
        className={styles.textarea}
        aria-label={kind === 'note' ? 'Your note' : 'Your question'}
        value={text}
        maxLength={OVERLAY_LIMITS.noteText}
        rows={3}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            submit()
          }
        }}
      />
      <div className={styles.formFoot}>
        {text.length >= COUNTER_FROM && (
          <span className={styles.counter} role="status">
            {text.length} of {OVERLAY_LIMITS.noteText}
          </span>
        )}
        <button type="submit" className={styles.solid} disabled={empty}>
          {kind === 'note' ? 'Add note' : 'Add question'}
        </button>
      </div>
    </form>
  )
}

/** The user's own notes and questions about one target, and a form to add more. */
export function NotesSection({ target }: { target: Target }) {
  const { board, allNotes } = useAppStore(useShallow((s) => ({ board: s.board, allNotes: s.overlay?.notes })))
  if (!board || !allNotes) return null
  const notes = allNotes.filter((n) => sameTarget(n.target, target))
  const needsReview = notes.some((n) => noteStatus(board, n) !== 'current')
  return (
    <Disclosure title="Your notes" count={notes.length} open={needsReview}>
      {notes.length > 0 && (
        <ul className={styles.list}>
          {notes.map((note) => {
            const status = noteStatus(board, note)
            return (
              <NoteCard
                key={note.id}
                note={note}
                status={status}
                actions={
                  status === 'possibly-outdated' ? (
                    <StillTrue id={note.id} />
                  ) : undefined
                }
              />
            )
          })}
        </ul>
      )}
      <NoteForm target={target} />
    </Disclosure>
  )
}
