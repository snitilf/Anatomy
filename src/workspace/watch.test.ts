import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import refundText from '../../e2e/fixtures/refund-approval.board.json?raw'
import { FILES } from './folder'
import { createMemoryFolder } from './memoryFolder'
import { observe, watchBoard } from './watch'

const a = { lastModified: 1, size: 10 }
const b = { lastModified: 2, size: 12 }
const c = { lastModified: 3, size: 12 }

describe('observe', () => {
  it('reads a changed file only once it stayed the same for two checks', () => {
    let step = observe({ seen: a }, b)
    expect(step.read).toBe(false)
    step = observe(step.state, c)
    expect(step.read).toBe(false)
    step = observe(step.state, c)
    expect(step.read).toBe(true)
  })

  it('does nothing for an unchanged or missing file, and forgets a change that was undone', () => {
    expect(observe({ seen: a }, a)).toEqual({ state: { seen: a }, read: false })
    expect(observe({ seen: a }, undefined)).toEqual({ state: { seen: a }, read: false })
    const pending = observe({ seen: a }, b).state
    expect(observe(pending, a)).toEqual({ state: { seen: a }, read: false })
  })
})

describe('watchBoard', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const revision = (n: number) => refundText.replace(/"revision": \d+/, `"revision": ${n}`)

  it('opens a higher revision after two quiet checks, and stays silent about a broken or older file', async () => {
    let time = 100
    const folder = createMemoryFolder('shop', new Map([[FILES.board, { text: revision(1), lastModified: 100 }]]), { clock: () => ++time })
    const seen = await folder.stat(FILES.board)
    const onBoard = vi.fn()
    let open = 1
    const stop = watchBoard(folder, { seen, revision: () => open, onBoard, intervalMs: 2000 })

    await folder.write(FILES.board, '{"format": "anatomy-bo')
    await vi.advanceTimersByTimeAsync(4000)
    expect(onBoard).not.toHaveBeenCalled()

    await folder.write(FILES.board, revision(1))
    await vi.advanceTimersByTimeAsync(4000)
    expect(onBoard).not.toHaveBeenCalled()

    await folder.write(FILES.board, revision(2))
    await vi.advanceTimersByTimeAsync(2000)
    expect(onBoard).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(onBoard).toHaveBeenCalledTimes(1)
    expect(onBoard.mock.calls[0]![0]).toMatchObject({ revision: 2 })
    open = 2

    await vi.advanceTimersByTimeAsync(10000)
    expect(onBoard).toHaveBeenCalledTimes(1)
    stop()
    await folder.write(FILES.board, revision(3))
    await vi.advanceTimersByTimeAsync(10000)
    expect(onBoard).toHaveBeenCalledTimes(1)
  })

  it('checks when the window gains focus, and not while the page is hidden', async () => {
    let time = 100
    const folder = createMemoryFolder('shop', new Map([[FILES.board, { text: revision(1), lastModified: 100 }]]), { clock: () => ++time })
    const onBoard = vi.fn()
    const stat = vi.spyOn(folder, 'stat')
    const stop = watchBoard(folder, { seen: undefined, revision: () => 0, onBoard, intervalMs: 2000 })
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(onBoard).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(onBoard).toHaveBeenCalledTimes(1)

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    stat.mockClear()
    await vi.advanceTimersByTimeAsync(6000)
    expect(stat).not.toHaveBeenCalled()
    visibility.mockRestore()
    stop()
  })
})
