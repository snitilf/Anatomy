import { describe, expect, it } from 'vitest'
import type { Mark } from '../layer/model'
import { arrowEnds, attachAt, dragBox, markBounds, nearestOnLine, pointAlong, rectExit, sameEnd, translateMark, type Scene } from './geometry'

const iso = '2026-01-01T00:00:00.000Z'
const scene: Scene = {
  rects: { a: { x: 0, y: 0, width: 100, height: 50 }, b: { x: 300, y: 0, width: 100, height: 50 } },
  lines: new Map([
    ['ab', [{ x: 100, y: 25 }, { x: 300, y: 25 }]],
    ['bent', [{ x: 0, y: 200 }, { x: 100, y: 200 }, { x: 100, y: 300 }]],
  ]),
}
const arrow = (from: Extract<Mark, { kind: 'arrow' }>['from'], to: Extract<Mark, { kind: 'arrow' }>['to']): Extract<Mark, { kind: 'arrow' }> => ({
  id: 'mark-abcdef',
  createdAt: iso,
  kind: 'arrow',
  from,
  to,
})

describe('points along a line', () => {
  it('finds the nearest point and how far along the line it is', () => {
    const on = nearestOnLine(scene.lines.get('bent')!, { x: 120, y: 250 })
    expect(on?.distance).toBeCloseTo(20)
    expect(on?.t).toBeCloseTo(0.75)
    expect(on?.point).toEqual({ x: 100, y: 250 })
  })

  it('walks a line by length, and clamps outside 0 to 1', () => {
    const bent = scene.lines.get('bent')!
    expect(pointAlong(bent, 0.25)).toEqual({ x: 50, y: 200 })
    expect(pointAlong(bent, 0.75)).toEqual({ x: 100, y: 250 })
    expect(pointAlong(bent, 2)).toEqual({ x: 100, y: 300 })
    expect(pointAlong([], 0.5)).toBeUndefined()
  })

  it('handles a line of one point', () => {
    expect(nearestOnLine([{ x: 3, y: 4 }], { x: 0, y: 0 })).toEqual({ distance: 5, t: 0, point: { x: 3, y: 4 } })
  })
})

describe('arrow ends', () => {
  it('leaves a part from its edge, toward the other end', () => {
    expect(rectExit({ x: 0, y: 0, width: 100, height: 50 }, { x: 300, y: 25 })).toEqual({ x: 100, y: 25 })
    expect(rectExit({ x: 0, y: 0, width: 100, height: 50 }, { x: 50, y: 225 })).toEqual({ x: 50, y: 50 })
    // A point inside the part gives its middle.
    expect(rectExit({ x: 0, y: 0, width: 100, height: 50 }, { x: 60, y: 30 })).toEqual({ x: 50, y: 25 })
  })

  it('joins two parts edge to edge', () => {
    expect(arrowEnds(arrow({ type: 'part', id: 'a' }, { type: 'part', id: 'b' }), scene)).toEqual({ a: { x: 100, y: 25 }, b: { x: 300, y: 25 } })
  })

  it('sits on a connection at its place along the drawn line, the middle when none is stored', () => {
    expect(arrowEnds(arrow({ type: 'point', x: 200, y: 100 }, { type: 'relationship', id: 'ab', t: 0.25 }), scene)?.b).toEqual({ x: 150, y: 25 })
    expect(arrowEnds(arrow({ type: 'point', x: 200, y: 100 }, { type: 'relationship', id: 'ab' }), scene)?.b).toEqual({ x: 200, y: 25 })
  })

  it('follows a part that moved', () => {
    const moved: Scene = { ...scene, rects: { ...scene.rects, b: { x: 300, y: 200, width: 100, height: 50 } } }
    const ends = arrowEnds(arrow({ type: 'point', x: 350, y: 100 }, { type: 'part', id: 'b' }), moved)
    expect(ends?.b).toEqual({ x: 350, y: 200 })
  })

  it('is not drawn when what it points at is gone', () => {
    expect(arrowEnds(arrow({ type: 'part', id: 'gone' }, { type: 'point', x: 0, y: 0 }), scene)).toBeUndefined()
    expect(arrowEnds(arrow({ type: 'relationship', id: 'gone' }, { type: 'point', x: 0, y: 0 }), scene)).toBeUndefined()
  })
})

describe('attaching an end', () => {
  it('takes the part under the pointer first', () => {
    expect(attachAt({ x: 200, y: 25 }, scene, 10, 'a')).toEqual({ type: 'part', id: 'a' })
  })

  it('ignores a part that is not on the map', () => {
    expect(attachAt({ x: 500, y: 500 }, scene, 10, 'gone')).toEqual({ type: 'point', x: 500, y: 500 })
  })

  it('then a connection within reach, with its place along the line', () => {
    expect(attachAt({ x: 150, y: 30 }, scene, 10)).toEqual({ type: 'relationship', id: 'ab', t: 0.25 })
    expect(attachAt({ x: 150, y: 50 }, scene, 10)).toEqual({ type: 'point', x: 150, y: 50 })
  })

  it('picks the nearest of two connections', () => {
    const two: Scene = { ...scene, lines: new Map([...scene.lines, ['near', [{ x: 100, y: 28 }, { x: 300, y: 28 }]]]) }
    expect(attachAt({ x: 150, y: 30 }, two, 10)).toMatchObject({ id: 'near' })
  })

  it('rounds a free point', () => {
    expect(attachAt({ x: 1.234, y: 5.678 }, scene, 1)).toEqual({ type: 'point', x: 1.2, y: 5.7 })
  })

  it('compares ends', () => {
    expect(sameEnd({ type: 'part', id: 'a' }, { type: 'part', id: 'a' })).toBe(true)
    expect(sameEnd({ type: 'part', id: 'a' }, { type: 'relationship', id: 'a' })).toBe(false)
    expect(sameEnd({ type: 'relationship', id: 'r', t: 0.5 }, { type: 'relationship', id: 'r', t: 0.6 })).toBe(false)
    expect(sameEnd({ type: 'point', x: 1, y: 2 }, { type: 'point', x: 1, y: 2 })).toBe(true)
  })
})

describe('moving marks', () => {
  it('moves every kind by the same distance', () => {
    const stroke: Mark = { id: 'mark-abcdef', createdAt: iso, kind: 'stroke', points: [{ x: 0, y: 0 }, { x: 10, y: 5 }] }
    expect(translateMark(stroke, 5, -5)).toMatchObject({ points: [{ x: 5, y: -5 }, { x: 15, y: 0 }] })
    const sticky: Mark = { id: 'mark-abcdef', createdAt: iso, kind: 'sticky', x: 10, y: 10, width: 160, height: 120, text: '' }
    expect(translateMark(sticky, 1.25, 2)).toMatchObject({ x: 11.3, y: 12 })
    expect(translateMark(sticky, 0, 0)).toBe(sticky)
  })

  it('keeps attached arrow ends in place and moves free ones', () => {
    const moved = translateMark(arrow({ type: 'part', id: 'a' }, { type: 'point', x: 10, y: 10 }), 5, 5)
    expect(moved).toMatchObject({ from: { type: 'part', id: 'a' }, to: { type: 'point', x: 15, y: 15 } })
  })

  it('measures the box of a mark as drawn', () => {
    expect(markBounds({ id: 'mark-abcdef', createdAt: iso, kind: 'stroke', points: [{ x: 5, y: 1 }, { x: -5, y: 9 }] }, scene)).toEqual({ x: -5, y: 1, width: 10, height: 8 })
    expect(markBounds(arrow({ type: 'part', id: 'a' }, { type: 'part', id: 'b' }), scene)).toEqual({ x: 100, y: 25, width: 200, height: 0 })
  })
})

describe('dragging out a box', () => {
  it('works in every direction', () => {
    expect(dragBox({ x: 10, y: 10 }, { x: 0, y: 30 }, false)).toEqual({ x: 0, y: 10, width: 10, height: 20 })
  })

  it('makes a square with Shift, toward the pointer', () => {
    expect(dragBox({ x: 10, y: 10 }, { x: 0, y: 40 }, true)).toEqual({ x: -20, y: 10, width: 30, height: 30 })
    expect(dragBox({ x: 10, y: 10 }, { x: 10, y: 10 }, true)).toEqual({ x: 10, y: 10, width: 0, height: 0 })
  })
})
