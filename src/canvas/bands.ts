import { GROUP_PADDING } from '../layout/cards'
import type { Rect } from '../layout/geometry'
import { textWidth } from './textMeasure'

/** The strip along the top of a group area that holds its name. Lines and labels keep out of it. */
export function groupBand(area: Rect): Rect {
  return { x: area.x, y: area.y, width: area.width, height: GROUP_PADDING.top }
}

/** Where the name of a group is drawn: 16px in from the sides, 12px down, one line. */
export function groupTitle(area: Rect & { label: string }): Rect {
  const room = Math.max(0, area.width - 32)
  return { x: area.x + 14, y: area.y + 8, width: Math.min(room, textWidth(area.label, 'title')) + 4, height: 24 }
}
