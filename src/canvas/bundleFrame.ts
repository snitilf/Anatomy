import type { Board } from '../board/schema'
import { groupAreas } from '../layout/cards'
import type { Rect } from '../layout/geometry'
import { frameViewport, type Frame } from './camera'
import { GLIDE_MS, prefersStillness, type Camera } from './cameraContext'
import { FAR_EXIT, GROUP_FRAME_ZOOM } from './far'

/** The box around some rectangles. */
export function boundsOf(rects: readonly (Rect | undefined)[]): Rect | undefined {
  const all = rects.filter((r): r is Rect => r !== undefined)
  if (all.length === 0) return undefined
  const x = Math.min(...all.map((r) => r.x))
  const y = Math.min(...all.map((r) => r.y))
  return { x, y, width: Math.max(...all.map((r) => r.x + r.width)) - x, height: Math.max(...all.map((r) => r.y + r.height)) - y }
}

/** Where one end of a bundle is on the map: the area of its group, or the card of a part with no group. */
export function blockRect(board: Board, rectOf: (id: string) => Rect | undefined, end: string): Rect | undefined {
  if (!end.startsWith('group:')) return rectOf(end)
  const id = end.slice(6)
  const rects: Record<string, Rect> = {}
  for (const c of board.components) {
    if (c.group !== id) continue
    const r = rectOf(c.id)
    if (r) rects[c.id] = r
  }
  return groupAreas(board, rects)[id]
}

const glide = () => (prefersStillness() ? 0 : GLIDE_MS * 1.5)

/** Frames both ends of a bundle, as close as the limits allow. */
export function frameBundle(camera: Camera, board: Board, a: string, b: string): void {
  const box = boundsOf([blockRect(board, camera.rectOf, a), blockRect(board, camera.rectOf, b)])
  if (box) camera.frame({ box, padding: 0.12, maxZoom: 1 }, glide())
}

/**
 * Frames one connection so its text reads. Both ends when they fit at a zoom that leaves the far view, else the part it
 * leaves from, at a readable zoom. `covered` is the share of the map's height that a sheet hides from the bottom.
 */
export function frameConnection(camera: Camera, from: Rect | undefined, to: Rect | undefined, covered = 0): void {
  const both = boundsOf([from, to])
  const size = camera.size()
  const area = { ...size, height: size.height * (1 - covered) }
  const show = (options: Frame) => {
    if (covered === 0) camera.frame(options, glide())
    else camera.move(frameViewport(camera.limits(), area, options), glide())
  }
  const wide: Frame = { padding: 0.25, maxZoom: 1 }
  if (both && frameViewport(camera.limits(), area, { ...wide, box: both }).zoom >= FAR_EXIT) {
    show({ ...wide, box: both })
    return
  }
  const near = from ?? to
  if (near) show({ box: near, padding: 0.5, maxZoom: 1, floorZoom: GROUP_FRAME_ZOOM })
}
