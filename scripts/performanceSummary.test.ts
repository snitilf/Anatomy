import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface Measure {
  frames?: number
  p95?: number
  max: number
  slow?: number
}
const summary = createRequire(import.meta.url)('../.github/scripts/performance-summary.cjs') as {
  parseMeasure: (text: string) => Measure | undefined
  tableRow: (title: string, text: string) => string
}

const DRAG = '[drag] forty parts: frames=64 p50=8.3ms p95=16.7ms max=33.3ms slow=0\n'
const BUDGET = '[resize, forty parts] frames=62 p50=8.4ms p95=17.1ms max=41.6ms slow=0\n'
const RELEASE = '[resize release] sixteen parts: frames=36 max=33.4ms\n'

describe('parseMeasure', () => {
  it('reads a drag line with p95, max, and slow frames', () => {
    expect(summary.parseMeasure(DRAG)).toEqual({ frames: 64, p95: 16.7, max: 33.3, slow: 0 })
  })

  it('reads the line of a budget check', () => {
    expect(summary.parseMeasure(BUDGET)).toMatchObject({ p95: 17.1, max: 41.6, slow: 0 })
  })

  it('reads a resize release line that has frames and max only', () => {
    expect(summary.parseMeasure(RELEASE)).toEqual({ frames: 36, max: 33.4 })
  })

  it('reads the line among other output', () => {
    expect(summary.parseMeasure(`warming up\n${RELEASE}done\n`)).toMatchObject({ max: 33.4 })
  })

  it('returns nothing when the test printed no measure', () => {
    expect(summary.parseMeasure('')).toBeUndefined()
    expect(summary.parseMeasure('something else max=abc\n')).toBeUndefined()
  })
})

describe('tableRow', () => {
  it('shows a drag line as a pass', () => {
    expect(summary.tableRow('chromium: dragging a card stays smooth: forty parts', DRAG)).toBe('| chromium: dragging a card stays smooth: forty parts | 16.70 | 33.30 | Pass |')
  })

  it('fails a drag with two slow frames', () => {
    expect(summary.tableRow('chromium: resizing a card', 'p95=10ms max=90ms slow=2')).toContain('| Fail |')
  })

  it('shows a resize release as measured, with no p95, and passes under the limit', () => {
    const row = summary.tableRow('chromium: releasing a resize leaves no long frame: sixteen parts', RELEASE)
    expect(row).toBe('| chromium: releasing a resize leaves no long frame: sixteen parts | - | 33.40 | Pass |')
    expect(row).not.toContain('Not measured')
  })

  it('fails a resize release at the limit', () => {
    expect(summary.tableRow('chromium: releasing a resize leaves no long frame: sixty parts', '[resize release] sixty parts: frames=40 max=50.0ms')).toBe('| chromium: releasing a resize leaves no long frame: sixty parts | - | 50.00 | Fail |')
  })

  it('says Not measured when there is no line', () => {
    expect(summary.tableRow('chromium: some test', '')).toBe('| chromium: some test | - | - | Not measured |')
  })
})
