import { useId } from 'react'
import type { Board } from '../board/schema'
import type { Target } from '../overlay/types'
import styles from './notes.module.css'
import { decodeTarget, encodeTarget } from './targets'

/** Every part, connection, and the board itself, as one list to attach a note to. */
export function TargetSelect({
  board,
  label,
  value,
  onChange,
}: {
  board: Board
  label: string
  value: Target | undefined
  onChange: (target: Target | undefined) => void
}) {
  const id = useId()
  const names = new Map(board.components.map((c) => [c.id, c.label]))
  return (
    <span className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <select
        id={id}
        className={styles.select}
        value={value ? encodeTarget(value) : ''}
        onChange={(event) => onChange(decodeTarget(event.target.value))}
      >
        <option value="">Choose</option>
        <option value="board">The whole board</option>
        <optgroup label="Parts">
          {board.components.map((c) => (
            <option key={c.id} value={`component:${c.id}`}>
              {c.label}
            </option>
          ))}
        </optgroup>
        {board.relationships.length > 0 && (
          <optgroup label="Connections">
            {board.relationships.map((r) => (
              <option key={r.id} value={`relationship:${r.id}`}>
                {names.get(r.from) ?? r.from} to {names.get(r.to) ?? r.to}: {r.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </span>
  )
}

/** A list of parts only, for the end of a link. */
export function PartSelect({
  board,
  label,
  value,
  exclude,
  onChange,
}: {
  board: Board
  label: string
  value: string
  exclude?: string | undefined
  onChange: (id: string) => void
}) {
  const id = useId()
  return (
    <span className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <select id={id} className={styles.select} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose a part</option>
        {board.components
          .filter((c) => c.id !== exclude)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
      </select>
    </span>
  )
}
