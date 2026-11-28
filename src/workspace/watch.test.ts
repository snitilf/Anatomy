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

  it('does not read a board over the limit, and does not look at it again until it changes', async () => {
    let time = 100
    const folder = createMemoryFolder('shop', new Map([[FILES.board, { text: revision(1), lastModified: 100 }]]), { clock: () => ++time })
    const seen = await folder.stat(FILES.board)
    const onBoard = vi.fn()
    const stop = watchBoard(folder, { seen, revision: () => 1, onBoard, intervalMs: 2000 })
    const read = vi.spyOn(folder, 'read')

    await folder.write(FILES.board, 'x'.repeat(1_000_001))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(onBoard).not.toHaveBeenCalled()
    // The one read was refused for its size, and the file was not asked for again.
    expect(read).toHaveBeenCalledTimes(1)
    await expect(read.mock.results[0]!.value).rejects.toMatchObject({ name: 'FileTooLargeError' })

    await folder.write(FILES.board, revision(2))
    await vi.advanceTimersByTimeAsync(4000)
    expect(onBoard).toHaveBeenCalledTimes(1)
    stop()
  })

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

  it('keeps checking while the page is hidden, ten seconds apart, and opens a revision it finds there', async () => {
    let time = 100
    const folder = createMemoryFolder('shop', new Map([[FILES.board, { text: revision(1), lastModified: 100 }]]), { clock: () => ++time })
    const seen = await folder.stat(FILES.board)
    const onBoard = vi.fn()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const stat = vi.spyOn(folder, 'stat')
    const stop = watchBoard(folder, { seen, revision: () => 1, onBoard, intervalMs: 2000 })

    await vi.advanceTimersByTimeAsync(9000)
    expect(stat).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(stat).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(stat).toHaveBeenCalledTimes(4)

    // A revision written in the background is read after two quiet slow checks.
    await folder.write(FILES.board, revision(2))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(onBoard).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(onBoard).toHaveBeenCalledTimes(1)
    expect(onBoard.mock.calls[0]![0]).toMatchObject({ revision: 2 })
    visibility.mockRestore()
    stop()
  })

  it('checks at once when the page becomes visible, then at the normal rate', async () => {
    let time = 100
    const folder = createMemoryFolder('shop', new Map([[FILES.board, { text: revision(1), lastModified: 100 }]]), { clock: () => ++time })
    const seen = await folder.stat(FILES.board)
    const onBoard = vi.fn()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const stat = vi.spyOn(folder, 'stat')
    const stop = watchBoard(folder, { seen, revision: () => 1, onBoard, intervalMs: 2000, hiddenIntervalMs: 10_000 })
    await vi.advanceTimersByTimeAsync(3000)
    expect(stat).not.toHaveBeenCalled()

    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(stat).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(6000)
    expect(stat).toHaveBeenCalledTimes(4)
    visibility.mockRestore()
    stop()
  })

  it('says why a file was not opened: a broken board, and a revision that does not rise', async () => {
    let time = 100
    const folder = createMemoryFolder('shop', new Map([[FILES.board, { text: revision(2), lastModified: 100 }]]), { clock: () => ++time })
    const seen = await folder.stat(FILES.board)
    const onBoard = vi.fn()
    const onProblem = vi.fn()
    const stop = watchBoard(folder, { seen, revision: () => 2, onBoard, onProblem, intervalMs: 2000 })

    // Half a file, caught mid-write, is not reported: only a file that stayed the same for two looks is read.
    await folder.write(FILES.board, '{"format": "anatomy-bo')
    await vi.advanceTimersByTimeAsync(2000)
    expect(onProblem).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(onProblem).toHaveBeenCalledTimes(1)
    expect(onProblem.mock.calls[0]![0]).toMatchObject({ kind: 'invalid', errors: expect.arrayContaining([expect.objectContaining({ message: expect.any(String) })]) })
    // It is not reported again until the file changes.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(onProblem).toHaveBeenCalledTimes(1)

    await folder.write(FILES.board, revision(2).replace('"title": "', '"title": "Edited '))
    await vi.advanceTimersByTimeAsync(4000)
    expect(onProblem).toHaveBeenCalledTimes(2)
    expect(onProblem.mock.calls[1]![0]).toMatchObject({ kind: 'not-rising', board: { revision: 2 } })

    await folder.write(FILES.board, revision(1))
    await vi.advanceTimersByTimeAsync(4000)
    expect(onProblem).toHaveBeenCalledTimes(3)
    expect(onProblem.mock.calls[2]![0]).toMatchObject({ kind: 'not-rising', board: { revision: 1 } })
    expect(onBoard).not.toHaveBeenCalled()

    // A higher revision opens, and says nothing about a problem.
    await folder.write(FILES.board, revision(3))
    await vi.advanceTimersByTimeAsync(4000)
    expect(onBoard).toHaveBeenCalledTimes(1)
    expect(onProblem).toHaveBeenCalledTimes(3)
    stop()
  })

  it('reports a board over the size limit as a problem, once', async () => {
    let time = 100
    const folder = createMemoryFolder('shop', new Map([[FILES.board, { text: revision(1), lastModified: 100 }]]), { clock: () => ++time })
    const seen = await folder.stat(FILES.board)
    const onProblem = vi.fn()
    const stop = watchBoard(folder, { seen, revision: () => 1, onBoard: vi.fn(), onProblem, intervalMs: 2000 })
    await folder.write(FILES.board, 'x'.repeat(1_000_001))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(onProblem).toHaveBeenCalledTimes(1)
    expect(onProblem.mock.calls[0]![0]).toMatchObject({ kind: 'invalid' })
    stop()
  })
})
