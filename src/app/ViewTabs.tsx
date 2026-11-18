import { Tabs } from '@base-ui/react/tabs'
import styles from './TopBar.module.css'
import { useAppStore } from './store'
import { useUi, useUiApi } from './ui'
import { showView } from './viewActions'
import type { View } from './view'

/** Map and Overview: two views of the same board. Linear's project tabs, as plain text. */
export function ViewTabs() {
  const ui = useUiApi()
  const view = useUi((u) => u.view)
  const boardId = useAppStore((s) => s.board?.id)
  return (
    <Tabs.Root value={view} onValueChange={(value) => showView(ui, boardId, value as View)}>
      <Tabs.List className={styles.views} aria-label="View">
        <Tabs.Tab className={styles.view} value="map">
          Map
        </Tabs.Tab>
        <Tabs.Tab className={styles.view} value="overview">
          Overview
        </Tabs.Tab>
      </Tabs.List>
    </Tabs.Root>
  )
}
