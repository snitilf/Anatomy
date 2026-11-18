import { describe, expect, it } from 'vitest'
import { FAR_ENTER, FAR_EXIT, farLabelScale, nextFar } from './far'

describe('the far view threshold', () => {
  it('starts where a 13px title would draw under 9px', () => {
    expect(13 * FAR_ENTER).toBeLessThan(9.01)
    expect(nextFar(false, 0.7)).toBe(false)
    expect(nextFar(false, 0.68)).toBe(true)
  })

  it('has one crossing in each direction, with a band between them', () => {
    expect(nextFar(true, 0.72)).toBe(true)
    expect(nextFar(false, 0.72)).toBe(false)
    expect(nextFar(true, FAR_EXIT)).toBe(false)
  })

  it('never flips when the zoom rests inside the band', () => {
    let far = false
    const seen = new Set<boolean>()
    for (const zoom of [0.8, 0.72, 0.7, 0.71, 0.72, 0.73, 0.71]) {
      far = nextFar(far, zoom)
      seen.add(far)
    }
    expect([...seen]).toEqual([false])
  })

  it('grows labels in quarter steps so they hold their size on screen', () => {
    for (const zoom of [0.1, 0.18, 0.33, 0.5, 0.68]) {
      const onScreen = farLabelScale(zoom) * zoom
      expect(onScreen).toBeGreaterThanOrEqual(1)
      expect(onScreen).toBeLessThan(1.3)
    }
  })
})
