import { Menu } from '@base-ui/react/menu'
import clsx from 'clsx'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useCommand, useCommands } from '../commands/context'
import { frameGroup } from '../canvas/groupFrame'
import { MIDDLE_MIN, UNFOLD_MARGIN } from './crumbRoom'
import menu from './menu.module.css'
import { trailOf, type Trail } from './crumbs'
import { Tip } from './Tip'
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
export function BoardCrumbs({ title, room }: { title: string; room?: number | undefined }) {
  const store = useAppStoreApi()
  // Only the words of the trail are read, so a drawing or the Overview's selection never renders the bar.
  const words = useAppStore((s) => (s.board && s.scenario === undefined ? JSON.stringify(trailOf(s.board, s.layer, s.selection) ?? null) : 'null'))
  const onMap = useUi((u) => u.view === 'map')
  const { context } = useCommands()
  const back = useCommand('goto.overview')
  const zoom = useCommand('zoom.selection')
  /** Clears the selection and puts focus back on the map element that was selected, since this button is gone with the selection. */
  const leave = () => {
    const selected = store.getState().selection
    back.run()
    if (!selected || selected.type === 'board') return
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(selected.id)}"], .react-flow__edge[data-id="${CSS.escape(selected.id)}"]`)
      target?.focus({ preventScroll: true })
    })
  }
  const [folded, setFolded] = useState(false)
  const foldedAt = useRef(0)
  const boardEl = useRef<HTMLButtonElement>(null)
  const groupEl = useRef<HTMLButtonElement>(null)
  // A new selection has new names, so it starts unfolded.
  useLayoutEffect(() => setFolded(false), [words])
  // The board and the group fold into one segment when either would show only a few letters of its name.
  // It unfolds when the room has grown by a margin, so it does not flicker at the edge.
  useLayoutEffect(() => {
    if (folded) {
      if (room !== undefined && room >= foldedAt.current + UNFOLD_MARGIN) setFolded(false)
      return
    }
    const squeezed = [boardEl.current, groupEl.current].some((el) => el && el.scrollWidth > el.clientWidth && el.clientWidth < MIDDLE_MIN)
    if (squeezed) {
      foldedAt.current = room ?? 0
      setFolded(true)
    }
  })
  const trail = useMemo(() => JSON.parse(words) as Trail | null, [words])
  if (!trail || !onMap) {
    return (
      <h1 className={styles.title} title={title}>
        {title}
      </h1>
    )
  }
  const { group, last } = trail
  const frame = () => {
    const camera = context().camera
    const board = store.getState().board
    if (camera && board && group) frameGroup(camera, board, group.id)
  }
  // With too little room the board and the group would show a few letters each, so they fold into one segment that lists them.
  if (folded) {
    return (
      <>
        <Menu.Root>
          <Menu.Trigger className={clsx(styles.segment, styles.fold)} aria-label="Board and group">
            …
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className={menu.positioner} side="bottom" align="start" sideOffset={6} collisionPadding={8}>
              <Menu.Popup className={menu.popup} data-dismissible>
                <Menu.Item className={menu.item} onClick={leave}>
                  <span className={menu.itemText}>{title}</span>
                </Menu.Item>
                {group && (
                  <Menu.Item className={menu.item} onClick={frame}>
                    <span className={menu.itemText}>{group.label}</span>
                  </Menu.Item>
                )}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        <Slash />
        <button type="button" className={clsx(styles.segment, styles.last)} title={last.label} aria-current="location" onClick={zoom.run}>
          {last.label}
        </button>
      </>
    )
  }
  return (
    <>
      <h1 className={clsx(styles.title, styles.step)}>
        <Tip label="Back to board" keys={back.shortcut}>
          <button ref={boardEl} type="button" className={clsx(styles.segment, styles.middle)} onClick={leave}>
            {title}
          </button>
        </Tip>
      </h1>
      {group && (
        <>
          <Slash />
          <button ref={groupEl} type="button" className={clsx(styles.segment, styles.middle)} title={group.label} onClick={frame}>
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
