import { describe, expect, it } from 'vitest'
import { labelTint, readTint } from './labelTint'

const group = { x: 0, y: 0, width: 200, height: 100 }

describe('labelTint', () => {
  it('is empty on plain canvas', () => {
    expect(labelTint([group], 500, 50, 100, 1, false)).toBe('')
    expect(readTint('')).toEqual([])
  })

  it('places an area from the middle of the label', () => {
    expect(readTint(labelTint([group], 150, 40, 100, 1, false))).toEqual([{ left: -150, top: -40, width: 200, height: 100 }])
  })

  it('keeps an area that ends inside the label, which is the straddling case', () => {
    // The label spans 150..250, the area ends at 200.
    expect(labelTint([group], 200, 50, 100, 1, false)).not.toBe('')
  })

  it('keeps every area under the label, nested or overlapping', () => {
    const inner = { x: 20, y: 20, width: 100, height: 40 }
    expect(readTint(labelTint([group, inner], 60, 40, 80, 1, false))).toHaveLength(2)
  })

  it('leaves out an area only just out of reach', () => {
    expect(labelTint([group], 200 + 50 + 20, 50, 100, 1, false)).toBe('')
  })

  it('reads a held-back label at its widest', () => {
    expect(labelTint([group], 200 + 120, 50, 0, 1, true)).not.toBe('')
  })

  it('is the same text when nothing moved', () => {
    expect(labelTint([group], 200, 50, 100, 1, false)).toBe(labelTint([{ ...group }], 200, 50, 100, 1, false))
  })
})
