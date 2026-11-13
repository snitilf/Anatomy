import { KIND_ORDER, KIND_WORDS } from '../app/labels'
import { KIND_STYLE, TONE_COLOR } from './kinds'
import styles from './Legend.module.css'

const SHORT: Record<(typeof KIND_ORDER)[number], string> = {
  calls: 'Calls',
  triggers: 'Triggers',
  'sends-data-to': 'Sends data to',
  'stores-in': 'Stores data in',
  'reads-from': 'Reads data from',
  'depends-on': 'Depends on',
  unknown: 'Not known',
}

export function Legend() {
  return (
    <details className={styles.legend}>
      <summary className={styles.summary}>Line key</summary>
      <ul className={styles.list}>
        {KIND_ORDER.map((kind) => {
          const s = KIND_STYLE[kind]
          return (
            <li key={kind} className={styles.row} title={KIND_WORDS[kind]}>
              <svg width="36" height="10" viewBox="0 0 36 10" aria-hidden="true">
                <line
                  x1="2"
                  y1="5"
                  x2="34"
                  y2="5"
                  stroke={TONE_COLOR[s.tone]}
                  strokeWidth={s.width}
                  strokeDasharray={s.dash || undefined}
                  strokeLinecap={s.dash.startsWith('1.5') ? 'round' : 'butt'}
                />
              </svg>
              <span>{SHORT[kind]}</span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
