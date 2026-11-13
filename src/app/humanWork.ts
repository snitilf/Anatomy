import type { Board } from '../board/schema'
import { resolvePositions } from '../overlay/layout'
import { emptyOverlay, type Overlay } from '../overlay/types'

/** True when the overlay holds notes, links, or a layout the user changed. */
export function hasHumanWork(board: Board, overlay: Overlay): boolean {
  if (overlay.notes.length > 0 || overlay.manualLinks.length > 0) return true
  const auto = resolvePositions(board, emptyOverlay(board.id))
  return JSON.stringify(overlay.positions) !== JSON.stringify(auto)
}
