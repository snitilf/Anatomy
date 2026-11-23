import { describe, expect, it } from 'vitest'
import { FLICK, FLICK_WINDOW, releaseVelocity, settleStop, type Sample } from './sheetStops'

// A 800 px tall sheet: the stops sit at 736 (peek), 400 (half) and 0 (full).
const all = { 0: 736, 1: 400, 2: 0 } as const

/** A finger that travels `dy` px over the last `ms` ms before the release at t = 1000. */
function drag(dy: number, ms: number, from = 400): { samples: Sample[]; now: number; y: number; at: number } {
  return { samples: [{ y: 500, t: 1000 - ms }, { y: 500 + dy, t: 1000 }], now: 1000, y: 500 + dy, at: from + dy }
}

describe('release velocity', () => {
  it('is distance over time across the last 100 ms', () => {
    const d = drag(20, 100)
    expect(releaseVelocity(d.samples, d.now, d.y)).toBeCloseTo(0.2, 10)
  })

  it('ignores samples older than 100 ms, so a finger that stopped does not fling', () => {
    const samples: Sample[] = [{ y: 0, t: 800 }, { y: 300, t: 850 }, { y: 301, t: 1000 }]
    expect(releaseVelocity(samples, 1000, 301)).toBe(0)
  })

  it('counts a sample exactly 100 ms old', () => {
    expect(FLICK_WINDOW).toBe(100)
    expect(releaseVelocity([{ y: 0, t: 900 }], 1000, 10)).toBeCloseTo(0.1, 10)
  })

  it('is zero with no samples or no elapsed time', () => {
    expect(releaseVelocity([], 1000, 5)).toBe(0)
    expect(releaseVelocity([{ y: 0, t: 1000 }], 1000, 50)).toBe(0)
  })

  it('is negative for an upward finger', () => {
    expect(releaseVelocity([{ y: 100, t: 950 }], 1000, 90)).toBeCloseTo(-0.2, 10)
  })
})

describe('settling on a stop', () => {
  it('goes to the nearest stop when the finger is slow, even past a stop', () => {
    // From half, a slow drag down by 250 px sits at 650: nearer the peek (736) than half (400).
    const d = drag(250, 2500)
    expect(settleStop(d.samples, d.now, d.y, d.at, all)).toBe(0)
    // A slow drag down by 100 px stays nearest to half.
    const e = drag(100, 1000)
    expect(settleStop(e.samples, e.now, e.y, e.at, all)).toBe(1)
  })

  it('does not fling exactly at the threshold', () => {
    // 11 px in 100 ms is exactly FLICK: not above it, so the nearest stop wins (half, at 411).
    expect(FLICK).toBe(0.11)
    const d = drag(11, 100)
    expect(settleStop(d.samples, d.now, d.y, d.at, all)).toBe(1)
  })

  it('flings just above the threshold to the next stop in its direction', () => {
    const down = drag(11.01, 100)
    expect(settleStop(down.samples, down.now, down.y, down.at, all)).toBe(0)
    const up = drag(-11.01, 100)
    expect(settleStop(up.samples, up.now, up.y, up.at, all)).toBe(2)
  })

  it('does not fling just below the threshold', () => {
    const d = drag(-10.99, 100)
    expect(settleStop(d.samples, d.now, d.y, d.at, all)).toBe(1)
  })

  it('goes one stop on a flick, even when a stop is far away', () => {
    // A hard flick up from the peek lands on half, the next stop up.
    const d = drag(-30, 100, 736)
    expect(settleStop(d.samples, d.now, d.y, d.at, all)).toBe(1)
  })

  it('stays at the last stop on a flick that way', () => {
    const up = drag(-30, 100, 0)
    expect(settleStop(up.samples, up.now, up.y, up.at, all)).toBe(2)
    const down = drag(30, 100, 736)
    expect(settleStop(down.samples, down.now, down.y, down.at, all)).toBe(0)
  })

  it('follows the last 100 ms on a reversal, not the whole drag', () => {
    // The finger went far down, then flicked back up before lifting.
    const samples: Sample[] = [{ y: 500, t: 700 }, { y: 700, t: 850 }, { y: 690, t: 900 }, { y: 670, t: 1000 }]
    // Moved 170 px down from the start, so the sheet is at 570, but the last 100 ms went up at 0.2 px/ms.
    expect(settleStop(samples, 1000, 670, 570, all)).toBe(1)
  })

  it('is the nearest stop with only one sample', () => {
    expect(settleStop([{ y: 500, t: 1000 }], 1000, 500, 550, all)).toBe(1)
    expect(settleStop([{ y: 500, t: 1000 }], 1000, 500, 700, all)).toBe(0)
  })
})
