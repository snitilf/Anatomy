import { NAMESPACES, type Namespace } from '../persistence/store'
import { usePersistence } from './persistenceContext'
import styles from './SpaceSwitch.module.css'

const SPACES = Object.keys(NAMESPACES) as Namespace[]

/** Home and Work keep separate boards. Switching never moves anything from one to the other. */
export function SpaceSwitch() {
  const { space, switchSpace } = usePersistence()
  return (
    <div className={styles.group} role="radiogroup" aria-label="Storage space">
      {SPACES.map((name) => (
        <label key={name} className={styles.option}>
          <input
            type="radio"
            name="storage-space"
            className={styles.input}
            checked={space === name}
            onChange={() => switchSpace(name)}
          />
          <span className={styles.face}>{NAMESPACES[name]}</span>
        </label>
      ))}
    </div>
  )
}
