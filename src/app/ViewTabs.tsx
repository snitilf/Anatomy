import { Segmented } from './Segmented'
import { useAppStore } from './store'
import styles from './TopBar.module.css'
import { useUi, useUiApi } from './ui'
import { showView } from './viewActions'
import type { View } from './view'

const OPTIONS: readonly { value: View; label: string }[] = [
  { value: 'map', label: 'Map' },
  { value: 'overview', label: 'Overview' },
]

/** Map and Overview: two views of the same board, centered in the top bar. */
export function ViewTabs() {
  const ui = useUiApi()
  const view = useUi((u) => u.view)
  const boardId = useAppStore((s) => s.board?.id)
  return (
    <div className={styles.center}>
      <Segmented kind="tabs" label="View" value={view} options={OPTIONS} onChange={(value) => showView(ui, boardId, value)} />
    </div>
  )
}
