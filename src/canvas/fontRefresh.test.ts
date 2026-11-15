import { describe, expect, it, vi } from 'vitest'
import { buildAfterMove, fontsLoaded, refreshWhenIdle, type Refreshable } from './fontRefresh'

type V = Refreshable & { n: number }
const rebuild = vi.fn((v: V): V => ({ n: v.n + 1 }))

describe('the refresh after fonts load', () => {
  it('builds an idle view again at once', () => {
    expect(fontsLoaded({ n: 0 }, rebuild)).toEqual({ n: 1 })
  })

  it('only marks a view with a card held, and builds it once after the drop or Escape, then clears the mark', () => {
    rebuild.mockClear()
    const held = fontsLoaded<V>({ n: 0, held: 'a' }, rebuild)
    expect(held).toEqual({ n: 0, held: 'a', fontStale: true })
    expect(refreshWhenIdle(held, rebuild)).toBe(held)
    const { held: _h, ...dropped } = held
    const after = refreshWhenIdle<V>(dropped, rebuild)
    expect(after).toEqual({ n: 1 })
    expect(refreshWhenIdle(after, rebuild)).toBe(after)
    expect(rebuild).toHaveBeenCalledTimes(1)
  })

  it('leaves a keyboard move that waits to settle alone, and builds after it settles', () => {
    rebuild.mockClear()
    const waiting = fontsLoaded<V>({ n: 0, settle: 250 }, rebuild)
    expect(waiting.settle).toBe(250)
    expect(rebuild).not.toHaveBeenCalled()
    const { settle: _s, ...settled } = waiting
    expect(refreshWhenIdle<V>(settled, rebuild)).toEqual({ n: 1 })
  })

  it('builds exactly once after a drop or a settled move that owes a refresh, with nothing reused', () => {
    for (const busy of [{ held: 'a' }, { settle: 250 }]) {
      const full = vi.fn((reuse: boolean): V => ({ n: reuse ? 100 : 1 }))
      const marked = fontsLoaded<V>({ n: 0, ...busy }, rebuild)
      const { held: _h, settle: _s, ...idle } = marked
      const after = buildAfterMove<V>(idle, full)
      expect(full).toHaveBeenCalledTimes(1)
      expect(full).toHaveBeenCalledWith(false)
      expect(refreshWhenIdle(after, rebuild)).toBe(after)
    }
  })

  it('reuses the untouched lines after an ordinary drop', () => {
    const full = vi.fn((reuse: boolean): V => ({ n: reuse ? 100 : 1 }))
    expect(buildAfterMove<V>({ n: 0 }, full)).toEqual({ n: 100 })
  })
})
