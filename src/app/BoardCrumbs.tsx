import clsx from 'clsx'
import { useMemo } from 'react'
import { useCommand, useCommands } from '../commands/context'
import { frameGroup } from '../canvas/groupFrame'
import { trailOf, type Trail } from './crumbs'
import { useAppStore, useAppStoreApi } from './store'
import styles from './TopBar.module.css'
import { useUi } from './ui'

function Slash() {
  return (
    <span className={styles.slash} aria-hidden="true">
      /
    </span>
  )
}

/**
 * The board's name, and, while a part or a line is selected on the map, where it sits: board / group / part.
 * The board segment clears the selection, the group frames the group, and the last one zooms to the selection.
 */
export function BoardCrumbs({ title }: { title: string }) {
  const store = useAppStoreApi()
  // Only the words of the trail are read, so a drawing or the Overview's selection never renders the bar.
  const words = useAppStore((s) => (s.board && s.scenario === undefined ? JSON.stringify(trailOf(s.board, s.layer, s.selection) ?? null) : 'null'))
  const onMap = useUi((u) => u.view === 'map')
  const { context } = useCommands()
  const back = useCommand('goto.overview')
  const zoom = useCommand('zoom.selection')
  const trail = useMemo(() => JSON.parse(words) as Trail | null, [words])
  if (!trail || !onMap) {
    return (
      <h1 className={styles.title} title={title}>
        {title}
      </h1>
    )
  }
  const { group, last } = trail
  return (
    <>
      <h1 className={clsx(styles.title, styles.step)}>
        <button type="button" className={clsx(styles.segment, styles.middle)} title={title} onClick={back.run}>
          {title}
        </button>
      </h1>
      {group && (
        <>
          <Slash />
          <button
            type="button"
            className={clsx(styles.segment, styles.middle)}
            title={group.label}
            onClick={() => {
              const camera = context().camera
              const board = store.getState().board
              if (camera && board) frameGroup(camera, board, group.id)
            }}
          >
            {group.label}
          </button>
        </>
      )}
      <Slash />
      <button type="button" className={clsx(styles.segment, styles.last)} title={last.label} aria-current="location" onClick={zoom.run}>
        {last.label}
      </button>
    </>
  )
}
