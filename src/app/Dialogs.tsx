import buttons from './buttons.module.css'
import { Modal } from './Modal'
import styles from './Modal.module.css'
import { usePersistence } from './persistenceContext'

/** The two questions the app can ask before it changes saved work. */
export function Dialogs() {
  const { deleting, choice, askDelete, confirmDelete, resolveChoice } = usePersistence()
  return (
    <>
      {deleting && (
        <Modal title={`Delete ${deleting.title}?`} onCancel={() => askDelete(undefined)}>
          <p className={styles.text}>
            This deletes the board and your notes from this browser. After that, an export file is the only copy.
          </p>
          <div className={styles.actions}>
            <button type="button" className={buttons.button} onClick={() => askDelete(undefined)}>
              Cancel
            </button>
            <button type="button" className={`${buttons.button} ${styles.danger}`} onClick={confirmDelete}>
              Delete board
            </button>
          </div>
        </Modal>
      )}
      {choice && (
        <Modal title={`This file has its own notes and layout for ${choice.title}.`} onCancel={() => resolveChoice(undefined)}>
          <p className={styles.text}>
            This browser has notes and layout for it too. Choose which to keep. Either way, the board comes from the file.
          </p>
          <div className={styles.actions}>
            <button type="button" className={buttons.button} onClick={() => resolveChoice(undefined)}>
              Cancel
            </button>
            <button type="button" className={buttons.button} onClick={() => resolveChoice('browser')}>
              Keep the notes in this browser
            </button>
            <button type="button" className={`${buttons.button} ${buttons.primary}`} onClick={() => resolveChoice('file')}>
              Use the file's notes
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
