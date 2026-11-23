import { act, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Rect } from '../layout/geometry'
import { useRouteBox } from './useRouteBox'

const box = (x: number): Rect => ({ x, y: 0, width: 10, height: 10 })

type Props = { compute: () => Rect | undefined; far: boolean; wanted: boolean; scope?: unknown }

describe('useRouteBox', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const setup = (far: boolean, wanted = true, wrapper?: typeof StrictMode) => {
    const first = vi.fn(() => box(1))
    const hook = renderHook((p: Props) => useRouteBox(p.compute, p.far, p.wanted, p.scope), {
      initialProps: { compute: first as () => Rect | undefined, far, wanted, scope: 'a' } as Props,
      ...(wrapper ? { wrapper } : {}),
    })
    return { first, hook }
  }
  const props = (compute: () => Rect | undefined, far = false, scope: unknown = 'a'): Props => ({ compute, far, wanted: true, scope })

  it('solves once on the first render, and keeps the answer', () => {
    const { first, hook } = setup(false)
    expect(hook.result.current.box).toEqual(box(1))
    act(() => void vi.runAllTimers())
    hook.rerender(props(first))
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('does not solve when the fit cannot reach the far view', () => {
    const { first, hook } = setup(false, false)
    act(() => void vi.runAllTimers())
    expect(first).not.toHaveBeenCalled()
    expect(hook.result.current.box).toBeUndefined()
  })

  it('leaves a new layout in the near view unsolved on its commit, and solves it when idle', () => {
    const { first, hook } = setup(false)
    const next = vi.fn(() => box(2))
    hook.rerender(props(next))
    expect(next).not.toHaveBeenCalled()
    expect(hook.result.current.box).toEqual(box(1))
    act(() => void vi.runAllTimers())
    expect(next).toHaveBeenCalledTimes(1)
    expect(hook.result.current.box).toEqual(box(2))
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('solves a new layout in the same render while the far view shows', () => {
    const { hook } = setup(true)
    const next = vi.fn(() => box(3))
    hook.rerender(props(next, true))
    expect(next).toHaveBeenCalledTimes(1)
    expect(hook.result.current.box).toEqual(box(3))
  })

  it('drops an idle solve that a newer layout made stale', () => {
    const { hook } = setup(false)
    const a = vi.fn(() => box(4))
    const b = vi.fn(() => box(5))
    hook.rerender(props(a))
    hook.rerender(props(b))
    act(() => void vi.runAllTimers())
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
    expect(hook.result.current.box).toEqual(box(5))
  })

  it('never hands out the box of another board, and solves the new board in its first render', () => {
    const { hook } = setup(false)
    const other = vi.fn(() => box(9))
    hook.rerender(props(other, false, 'b'))
    expect(other).toHaveBeenCalledTimes(1)
    expect(hook.result.current.box).toEqual(box(9))
  })

  it('gives no box for a new board that the fit cannot reach the far view on', () => {
    const { hook } = setup(false)
    hook.rerender({ ...props(vi.fn(() => box(9)), false, 'b'), wanted: false })
    expect(hook.result.current.box).toBeUndefined()
  })

  it('cancels the pending solve when the hook unmounts', () => {
    const { hook } = setup(false)
    const next = vi.fn(() => box(2))
    hook.rerender(props(next))
    hook.unmount()
    vi.runAllTimers()
    expect(next).not.toHaveBeenCalled()
  })

  it('uses the idle callback when the browser has one, and cancels it', () => {
    const request = vi.fn((_cb: () => void, _o?: unknown) => 7)
    const cancel = vi.fn()
    vi.stubGlobal('requestIdleCallback', request)
    vi.stubGlobal('cancelIdleCallback', cancel)
    Object.assign(window, { requestIdleCallback: request, cancelIdleCallback: cancel })
    const { hook } = setup(false)
    const next = vi.fn(() => box(2))
    hook.rerender(props(next))
    expect(request).toHaveBeenCalledTimes(1)
    const run = request.mock.calls[0]![0]
    hook.rerender(props(vi.fn(() => box(3))))
    expect(cancel).toHaveBeenCalledWith(7)
    act(() => run())
    hook.unmount()
    delete (window as { requestIdleCallback?: unknown }).requestIdleCallback
    delete (window as { cancelIdleCallback?: unknown }).cancelIdleCallback
  })

  it('solves once, and cancels the idle solve, when the near view turns into the far view while it waits', () => {
    const { hook } = setup(false)
    const next = vi.fn(() => box(2))
    hook.rerender(props(next, false))
    hook.rerender(props(next, true))
    expect(next).toHaveBeenCalledTimes(1)
    act(() => void vi.runAllTimers())
    expect(next).toHaveBeenCalledTimes(1)
    expect(hook.result.current.box).toEqual(box(2))
  })

  it('settles under StrictMode with the right box', () => {
    const { hook } = setup(false, true, StrictMode)
    expect(hook.result.current.box).toEqual(box(1))
    const next = vi.fn(() => box(2))
    hook.rerender(props(next))
    act(() => void vi.runAllTimers())
    expect(hook.result.current.box).toEqual(box(2))
  })

  describe('resolveNow', () => {
    it('solves a stale box at once and keeps it, so the idle solve has nothing left to do', () => {
      const { hook } = setup(false)
      const next = vi.fn(() => box(2))
      hook.rerender(props(next))
      expect(next).not.toHaveBeenCalled()
      let got: Rect | undefined
      act(() => {
        got = hook.result.current.resolveNow()
      })
      expect(got).toEqual(box(2))
      expect(next).toHaveBeenCalledTimes(1)
      act(() => void vi.runAllTimers())
      expect(next).toHaveBeenCalledTimes(1)
      expect(hook.result.current.box).toEqual(box(2))
    })

    it('answers from the kept box when it is fresh', () => {
      const { first, hook } = setup(false)
      expect(hook.result.current.resolveNow()).toEqual(box(1))
      expect(first).toHaveBeenCalledTimes(1)
    })

    it('does not solve twice when asked twice before the next render', () => {
      const { hook } = setup(false)
      const next = vi.fn(() => box(2))
      hook.rerender(props(next))
      act(() => {
        hook.result.current.resolveNow()
        hook.result.current.resolveNow()
      })
      expect(next).toHaveBeenCalledTimes(1)
    })
  })
})
