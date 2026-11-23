import { afterEach, describe, expect, it, vi } from 'vitest'
import { whenIdle } from './idle'

describe('whenIdle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('waits for the load event, then two animation frames, then an idle moment', () => {
    const frames: FrameRequestCallback[] = []
    const idle: (() => void)[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => idle.push(cb))
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
    const work = vi.fn()
    whenIdle(work)
    expect(frames).toHaveLength(0)
    window.dispatchEvent(new Event('load'))
    expect(frames).toHaveLength(1)
    frames.shift()!(0)
    expect(frames).toHaveLength(1)
    expect(idle).toHaveLength(0)
    frames.shift()!(0)
    expect(idle).toHaveLength(1)
    expect(work).not.toHaveBeenCalled()
    idle.shift()!()
    expect(work).toHaveBeenCalledTimes(1)
  })

  it('does not wait for a load that has already happened', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete')
    whenIdle(() => undefined)
    expect(frames).toHaveLength(1)
  })
})
