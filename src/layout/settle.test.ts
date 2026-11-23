import { describe, expect, it } from 'vitest'
import { settle } from './autoLayout'

const size = { width: 240, height: 112 }

describe('lifting boxes into the room above them', () => {
  it('holds a box only under the boxes of its own column, even when the stacked gap is wider than a column gap', () => {
    // A busy board stacks cards 80 apart, while its columns sit 64 apart. The box in the second column is not under the
    // first box, so it holds nothing up, and the box under the first box rises to 80 below it.
    const at = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 304, y: 120 }],
      ['c', { x: 0, y: 400 }],
    ])
    const out = settle({ at, width: 544, height: 512 }, new Map([...at.keys()].map((id) => [id, size])), [], 80)
    expect(out.height).toBe(304)
    expect(out.at.get('c')).toEqual({ x: 0, y: 192 })
  })

  it('never takes two boxes beside each other for a stack with a gap below zero', () => {
    const at = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 270, y: 40 }],
      ['c', { x: 0, y: 400 }],
    ])
    const out = settle({ at, width: 510, height: 512 }, new Map([...at.keys()].map((id) => [id, size])), [], 80)
    // b overlaps a down the map, so they are side by side: c rises under a alone.
    expect(out.at.get('c')).toEqual({ x: 0, y: 192 })
  })
})
