import { describe, expect, it } from 'vitest'
import { clampViewport, contentBounds, frameViewport, MAX_ZOOM, PAN_MARGIN, READABLE_ZOOM, START_ZOOM, stepZoom, viewportShowing, zoomLimits } from './camera'

const map = { width: 1000, height: 700 }
const board = { x: 0, y: 0, width: 2000, height: 1000 }

describe('zoom limits', () => {
  it('lets the map zoom out only until the whole content fits, and never needs more than 100%', () => {
    const limits = zoomLimits(board, map)
    expect(limits.fitZoom).toBeLessThan(0.5)
    expect(limits.minZoom).toBeCloseTo(limits.fitZoom, 6)
    expect(limits.maxZoom).toBe(MAX_ZOOM)
    // A small board fits at more than 100%, so its minimum is 100%.
    expect(zoomLimits({ x: 0, y: 0, width: 300, height: 200 }, map).minZoom).toBe(1)
  })

  it('pans no further than a margin past the content', () => {
    const { extent } = zoomLimits(board, map)
    expect(extent).toEqual([
      [-PAN_MARGIN, -PAN_MARGIN],
      [2000 + PAN_MARGIN, 1000 + PAN_MARGIN],
    ])
  })

  it('counts cards, group areas, marks, and proposed parts in the content', () => {
    const bounds = contentBounds(
      [{ x: 0, y: 0, width: 100, height: 100 }],
      [{ x: -20, y: -40, width: 140, height: 160 }],
      [{ id: 'mark-aaaaaa', createdAt: '2026-11-14T00:00:00Z', kind: 'stroke', points: [{ x: 500, y: 50 }, { x: 520, y: 400 }] }],
      [{ id: 'part-aaaaaa', label: 'New', summary: '', x: -300, y: 0, width: 200, height: 100, createdAt: '2026-11-14T00:00:00Z' }],
    )
    expect(bounds).toEqual({ x: -300, y: -40, width: 820, height: 440 })
  })
})

describe('clampViewport', () => {
  const limits = zoomLimits(board, map)

  it('keeps the zoom between the limits', () => {
    expect(clampViewport({ x: 0, y: 0, zoom: 0.01 }, limits, map).zoom).toBeCloseTo(limits.minZoom, 6)
    expect(clampViewport({ x: 0, y: 0, zoom: 9 }, limits, map).zoom).toBe(MAX_ZOOM)
  })

  it('pulls a view that left the content back to the edge of the margin', () => {
    // At 100% the view is 1000 wide. Panned far to the right of the content, it stops at the margin.
    const v = clampViewport({ x: -5000, y: 0, zoom: 1 }, limits, map)
    expect(-v.x + map.width).toBeCloseTo(2000 + PAN_MARGIN, 6)
    const w = clampViewport({ x: 5000, y: 0, zoom: 1 }, limits, map)
    expect(-w.x).toBeCloseTo(-PAN_MARGIN, 6)
  })

  it('centers content on an axis where it and its margin are smaller than the map', () => {
    // 200 wide plus the margins is narrower than the map, so it is centered across. Down, the margins reach past it.
    const small = zoomLimits({ x: 0, y: 0, width: 200, height: 100 }, map)
    const v = clampViewport({ x: 900, y: -400, zoom: 1 }, small, map)
    expect(v.x).toBeCloseTo((map.width - 200) / 2, 6)
    expect(v.y).toBeGreaterThan(0)
    expect(v.y + 100).toBeLessThan(map.height)
  })

  it('leaves a view inside the limits alone', () => {
    expect(clampViewport({ x: -100, y: -50, zoom: 1 }, limits, map)).toEqual({ x: -100, y: -50, zoom: 1 })
  })
})

describe('framing', () => {
  it('fits a board that stays readable, and shows the start of the flow at a readable zoom otherwise', () => {
    const roomy = { x: 0, y: 0, width: 900, height: 500 }
    const fit = frameViewport(zoomLimits(roomy, map), { ...map, top: 0 }, { readable: true })
    expect(fit.zoom).toBeGreaterThanOrEqual(READABLE_ZOOM)
    const big = frameViewport(zoomLimits(board, map), { ...map, top: 0 }, { readable: true, start: { x: 0, y: 300, width: 240, height: 112 } })
    expect(big.zoom).toBe(START_ZOOM)
    // The left edge of the board is near the left of the map.
    expect(big.x).toBeGreaterThan(0)
    expect(big.x).toBeLessThan(40)
  })
})

describe('stepZoom', () => {
  const limits = { minZoom: 0.4, maxZoom: 2 }
  it('steps along fixed levels and stops at the limits', () => {
    expect(stepZoom(1, 1, limits)).toBe(1.25)
    expect(stepZoom(1, -1, limits)).toBe(0.8)
    expect(stepZoom(0.9, -1, limits)).toBe(0.8)
    expect(stepZoom(0.5, -1, limits)).toBe(0.4)
    expect(stepZoom(0.4, -1, limits)).toBe(0.4)
    expect(stepZoom(2, 1, limits)).toBe(2)
  })
})

describe('viewportShowing', () => {
  it('pans just far enough to bring a dropped card back into view', () => {
    const v = viewportShowing({ x: 0, y: 0, zoom: 1 }, { ...map, top: 0 }, { x: 1100, y: 100, width: 240, height: 112 })
    expect(v).toBeDefined()
    expect(1100 + 240 + v!.x).toBeLessThanOrEqual(map.width)
    expect(viewportShowing({ x: 0, y: 0, zoom: 1 }, { ...map, top: 0 }, { x: 100, y: 100, width: 240, height: 112 })).toBeUndefined()
  })
})
