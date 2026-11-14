import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSaveQueue, type SaveStatus } from './saveQueue'
import { StorageError } from './db'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('save queue', () => {
  it('coalesces rapid schedules into one write', async () => {
    const save = vi.fn(() => Promise.resolve())
    const queue = createSaveQueue<number>(save, 400)
    const statuses: SaveStatus[] = []
    queue.onStatus((s) => statuses.push(s))
    for (let i = 1; i <= 5; i++) {
      queue.schedule(i)
      await vi.advanceTimersByTimeAsync(100)
    }
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(400)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(5)
    expect(statuses.at(-1)).toBe('saved')
    expect(statuses.filter((s) => s === 'saving')).toHaveLength(1)
    expect(statuses.indexOf('pending')).toBeLessThan(statuses.indexOf('saving'))
    expect(statuses.indexOf('saving')).toBeLessThan(statuses.indexOf('saved'))
  })

  it('keeps the value after a failure and retry writes it', async () => {
    const quota = new StorageError('quota', 'full')
    const save = vi.fn<(v: string) => Promise<void>>().mockRejectedValueOnce(quota).mockResolvedValue(undefined)
    const queue = createSaveQueue(save, 100)
    const statuses: SaveStatus[] = []
    queue.onStatus((s) => statuses.push(s))
    queue.schedule('a')
    await vi.advanceTimersByTimeAsync(100)
    expect(statuses.at(-1)).toEqual({ error: quota })
    await queue.retry()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('a')
    expect(statuses.at(-1)).toBe('saved')
  })

  it('writes a newer value scheduled after a failure', async () => {
    const save = vi
      .fn<(v: string) => Promise<void>>()
      .mockRejectedValueOnce(new StorageError('failed', 'x'))
      .mockResolvedValue(undefined)
    const queue = createSaveQueue(save, 100)
    queue.schedule('a')
    await vi.advanceTimersByTimeAsync(100)
    queue.schedule('b')
    await vi.advanceTimersByTimeAsync(100)
    expect(save).toHaveBeenLastCalledWith('b')
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('flush waits for the in-flight save and never overlaps saves', async () => {
    let release: () => void = () => undefined
    let active = 0
    let maxActive = 0
    const save = vi.fn(async (_v: number) => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise<void>((resolve) => {
        release = resolve
      })
      active--
    })
    const queue = createSaveQueue<number>(save, 100)
    queue.schedule(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(save).toHaveBeenCalledTimes(1)
    queue.schedule(2)
    let flushed = false
    const done = queue.flush().then(() => {
      flushed = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(flushed).toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(2)
    release()
    await done
    expect(flushed).toBe(true)
    expect(maxActive).toBe(1)
    expect(save).toHaveBeenLastCalledWith(2)
  })

  it('flush writes immediately without waiting for the delay', async () => {
    const save = vi.fn(() => Promise.resolve())
    const queue = createSaveQueue<number>(save, 400)
    queue.schedule(7)
    await queue.flush()
    expect(save).toHaveBeenCalledWith(7)
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('still writes after a flush that found nothing to write', async () => {
    const save = vi.fn(() => Promise.resolve())
    const queue = createSaveQueue<number>(save, 400)
    await queue.flush()
    queue.schedule(3)
    await queue.flush()
    expect(save).toHaveBeenCalledWith(3)
  })
})
