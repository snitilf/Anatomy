import { diffText, type Piece } from './textDiff'
import type { FieldChange } from './fieldChanges'
import styles from './RevisionChange.module.css'

/** The connection's ends are named From and To everywhere else. */
const FIELD_LABEL: Record<string, string> = { start: 'From', end: 'To' }
const label = (field: string) => FIELD_LABEL[field] ?? field.charAt(0).toUpperCase() + field.slice(1)

/** Long text that did not change is cut to about this many characters around each change. */
const CONTEXT = 80

/** One side of a change: the words that differ are struck through when they left, and underlined when they came. */
function Side({ pieces, mark }: { pieces: readonly Piece[]; mark: 'del' | 'ins' }) {
  if (pieces.length === 0) return <span className={styles.none}>None</span>
  const Mark = mark
  return (
    <span className={styles.text}>
      {pieces.map((p, i) => (p.changed ? <Mark key={i}>{p.text}</Mark> : <span key={i}>{p.text}</span>))}
    </span>
  )
}

/** Each field that changed, with its words before and after and the words that differ marked. It loads on its own script. */
export default function RevisionFields({ fields }: { fields: readonly FieldChange[] }) {
  return (
    <div className={styles.fields}>
      {fields.map((f) => {
        const diff = diffText(f.before, f.after, { context: CONTEXT })
        return (
          <div key={f.field} role="group" aria-label={label(f.field)} className={styles.field}>
            <p className={styles.name}>{label(f.field)}</p>
            <p className={styles.side}>
              <span className={styles.which}>Before</span>
              <Side pieces={diff.before} mark="del" />
            </p>
            <p className={styles.side}>
              <span className={styles.which}>Now</span>
              <Side pieces={diff.after} mark="ins" />
            </p>
          </div>
        )
      })}
    </div>
  )
}
