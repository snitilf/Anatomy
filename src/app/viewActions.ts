import type { UiApi } from './ui'
import { rememberView, writeHash, type View } from './view'

/** Shows the map or the Overview page: the state, the address (one history entry, so back returns), and the memory for this board. */
export function showView(ui: UiApi, boardId: string | undefined, view: View): void {
  if (ui.store.getState().view === view) return
  ui.setViewState(view)
  writeHash(view, true, boardId)
  if (boardId) rememberView(boardId, view)
}
