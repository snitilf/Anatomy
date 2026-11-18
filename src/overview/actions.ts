import { useMemo } from 'react'
import type { Selection } from '../app/state'
import { useAppDispatch, useAppStoreApi } from '../app/store'
import { useUiApi } from '../app/ui'
import { usePhone } from '../app/usePhone'
import { showView } from '../app/viewActions'
import { commandById } from '../commands/list'
import { useCommands } from '../commands/context'
import { overviewMemory } from './memory'

export interface OverviewActions {
  /** Shows the part or connection on the map, selected and zoomed to, with the sidebar on it. */
  openOnMap(selection: Selection, row: string): void
  /** Shows the map with the sidebar on Review, at the group with this title. */
  openReview(groupTitle: string, row: string): void
  /** Starts a walkthrough on the map. */
  play(id: string, row: string): void
}

/** Rows of the Overview send the user back to the map. This is the one place that does it. */
export function useOverviewActions(boardId: string): OverviewActions {
  const dispatch = useAppDispatch()
  const store = useAppStoreApi()
  const ui = useUiApi()
  const { run, context } = useCommands()
  const phone = usePhone()
  return useMemo(() => {
    const leave = (row: string) => {
      overviewMemory(boardId).row = row
      showView(ui, boardId, 'map')
    }
    return {
      openOnMap(selection, row) {
        leave(row)
        dispatch({ type: 'select', selection })
        ui.setSidebarOpen(true)
        ui.setTab('details')
        // On a phone the map's own framing keeps the selection above the sheet, so it is left to do that.
        if (phone) return
        // After the map is in front and has drawn the selection.
        requestAnimationFrame(() => {
          if (store.getState().selection) run(commandById('zoom.selection'))
        })
      },
      openReview(groupTitle, row) {
        leave(row)
        ui.setSidebarOpen(true)
        ui.setTab('review')
        if (ui.store.getState().sheet === 0) ui.setSheet(1)
        requestAnimationFrame(() => {
          const groups = document.querySelectorAll<HTMLElement>('[data-scroll] section[aria-label]')
          for (const g of groups) if (g.getAttribute('aria-label') === groupTitle) g.scrollIntoView({ block: 'start' })
        })
      },
      play(id, row) {
        leave(row)
        context().shell.playWalkthrough(id)
      },
    }
  }, [boardId, dispatch, store, ui, run, context, phone])
}
