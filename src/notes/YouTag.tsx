import styles from './notes.module.css'

/** Marks anything the user wrote. Agent content never carries it. */
export function YouTag() {
  return <span className={styles.you}>You</span>
}
