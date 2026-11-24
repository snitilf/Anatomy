import { describe, expect, it } from 'vitest'
import type { Rect } from '../layout/geometry'
import { farMark, freeCorner, markBox, MARK_INSET, MARK_PX } from './startMarks'

const card: Rect = { x: 100, y: 200, width: 240, height: 112 }
const inside = (box: Rect, outer: Rect) => box.x >= outer.x && box.y >= outer.y && box.x + box.width <= outer.x + outer.width && box.y + box.height <= outer.y + outer.height

describe('markBox', () => {
  it.each(['tr', 'tl', 'br', 'bl'] as const)('keeps the mark inside the card at the %s corner, at every scale', (corner) => {
    for (const scale of [1, 1.4, 2, 2.3]) expect(inside(markBox(card, corner, MARK_PX * scale, MARK_INSET * scale), card)).toBe(true)
  })

  it('puts the mark on its corner, inset from both edges', () => {
    const box = markBox(card, 'tr', 14, 4)
    expect(box).toEqual({ x: 100 + 240 - 4 - 14, y: 200 + 4, width: 14, height: 14 })
    expect(markBox(card, 'bl', 14, 4)).toEqual({ x: 104, y: 200 + 112 - 4 - 14, width: 14, height: 14 })
  })
})

describe('freeCorner', () => {
  const scales = [1, 2]
  const none = () => [] as Rect[]

  it('takes the first corner of the order when nothing is in the way', () => {
    expect(freeCorner(card, ['tr', 'tl', 'br'], scales, none)).toBe('tr')
  })

  it('moves to the next corner when a label covers the first, at any one of the scales', () => {
    // A label that sits on the top right corner at the larger scale only.
    const label = (scale: number): Rect[] => (scale === 2 ? [{ x: 300, y: 200, width: 60, height: 20 }] : [])
    expect(freeCorner(card, ['tr', 'tl', 'br'], scales, label)).toBe('tl')
  })

  it('answers nothing when every corner of the order is covered', () => {
    const everywhere = (): Rect[] => [card]
    expect(freeCorner(card, ['tr', 'tl', 'br'], scales, everywhere)).toBeUndefined()
  })

  it('does not count a box that only touches the mark', () => {
    const box = markBox(card, 'tr', 14, 4)
    const edge = (): Rect[] => [{ x: box.x + box.width, y: box.y, width: 10, height: 10 }]
    expect(freeCorner(card, ['tr'], [1], edge)).toBe('tr')
  })
})

describe('farMark', () => {
  const tile: Rect = { x: 0, y: 0, width: 240, height: 112 }

  it('sits at the bottom right of the tile at full size when the tile is free', () => {
    const mark = farMark(tile, 1, [])
    expect(mark?.corner).toBe('br')
    expect(mark?.box.width).toBe(MARK_PX)
  })

  it('takes a smaller mark when a group name covers the top of the tile, and none when even the smallest does not fit', () => {
    const name = (height: number): Rect[] => [{ x: 0, y: 0, width: 200, height }]
    const small = farMark(tile, 3, name(70))
    expect(small).toBeDefined()
    expect(small!.box.width).toBeLessThan(MARK_PX * 3)
    expect(inside(small!.box, tile)).toBe(true)
    expect(farMark(tile, 3, name(105))).toBeUndefined()
  })

  it('never leaves the tile', () => {
    for (const scale of [1, 2, 3.5, 6]) {
      const mark = farMark(tile, scale, [])
      if (mark) expect(inside(mark.box, tile)).toBe(true)
    }
  })

  it('moves to the bottom left when the bottom right is covered', () => {
    const cover: Rect[] = [{ x: 150, y: 70, width: 90, height: 42 }]
    expect(farMark(tile, 1, cover)?.corner).toBe('bl')
  })
})
