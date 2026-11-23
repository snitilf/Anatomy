import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Rect } from '../layout/geometry'
import { useRouteBox } from './useRouteBox'

const box = (x: number): Rect => ({ x, y: 0, width: 10, height: 10 })

describe('useRouteBox', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = (far: boolean, wanted = true) => {
    const first = vi.fn(() => box(1))
    const hook = renderHook((p: { compute: () => Rect | undefined; far: boolean; wanted: boolean }) => useRouteBox(p.compute, p.far, p.wanted), {
      initialProps: { compute: first as () => Rect | undefined, far, wanted },
    })
    return { first, hook }
  }

  it('solves once on the first render, and keeps the answer', () => {
    const { first, hook } = setup(false)
    expect(hook.result.current).toEqual(box(1))
    act(() => void vi.runAllTimers())
    hook.rerender({ compute: first, far: false, wanted: true })
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('does not solve when the fit cannot reach the far view', () => {
    const { first, hook } = setup(false, false)
    act(() => void vi.runAllTimers())
    expect(first).not.toHaveBeenCalled()
    expect(hook.result.current).toBeUndefined()
  })

  it('leaves a new layout in the near view unsolved on its commit, and solves it when idle', () => {
    const { first, hook } = setup(false)
    const next = vi.fn(() => box(2))
    hook.rerender({ compute: next, far: false, wanted: true })
    expect(next).not.toHaveBeenCalled()
    expect(hook.result.current).toEqual(box(1))
    act(() => void vi.runAllTimers())
    expect(next).toHaveBeenCalledTimes(1)
    expect(hook.result.current).toEqual(box(2))
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('solves a new layout in the same render while the far view shows', () => {
    const { hook } = setup(true)
    const next = vi.fn(() => box(3))
    hook.rerender({ compute: next, far: true, wanted: true })
    expect(next).toHaveBeenCalledTimes(1)
    expect(hook.result.current).toEqual(box(3))
  })

  it('drops an idle solve that a newer layout made stale', () => {
    const { hook } = setup(false)
    const a = vi.fn(() => box(4))
    const b = vi.fn(() => box(5))
    hook.rerender({ compute: a, far: false, wanted: true })
    hook.rerender({ compute: b, far: false, wanted: true })
    act(() => void vi.runAllTimers())
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
    expect(hook.result.current).toEqual(box(5))
  })
})
