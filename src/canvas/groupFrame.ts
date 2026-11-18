import type { Board } from '../board/schema'
import { groupAreas } from '../layout/cards'
import type { Rect } from '../layout/geometry'
import { GLIDE_MS, prefersStillness, type Camera } from './cameraContext'
import { GROUP_FRAME_ZOOM } from './far'

/** Frames a group's area at a zoom where its cards show their text. The far view's group pick and the top bar crumb both use it. */
export function frameArea(camera: Camera, area: Rect): void {
  camera.frame({ box: area, padding: 0.06, maxZoom: 1, floorZoom: GROUP_FRAME_ZOOM }, prefersStillness() ? 0 : GLIDE_MS * 1.5)
}

/** Frames the group with this ID, from where its cards are on the map now. Does nothing for a group with no cards. */
export function frameGroup(camera: Camera, board: Board, groupId: string): void {
  const rects: Record<string, Rect> = {}
  for (const c of board.components) {
    const r = camera.rectOf(c.id)
    if (r) rects[c.id] = r
  }
  const area = groupAreas(board, rects)[groupId]
  if (area) frameArea(camera, area)
}
