import { describe, expect, it } from 'vitest'
import { clampViewport, contentBounds, fitBounds, frameViewport, LEGIBLE_ZOOM, MAX_ZOOM, SELECT_ROOM, PAN_MARGIN, READABLE_ZOOM, START_ZOOM, stepZoom, viewportFor, viewportShowing, zoomLimits } from './camera'

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

describe('far-view routes in the fit', () => {
  const cards = [{ x: 0, y: 0, width: 800, height: 600 }]
  const route = { x: 780, y: -40, width: 500, height: 700 }

  it('counts the routes of the far view in the content', () => {
    expect(contentBounds(cards, [], [], [], [route])).toEqual({ x: 0, y: -40, width: 1280, height: 700 })
  })

  it('adds the routes to the box when the fit lands in the far view', () => {
    const phone = { width: 390, height: 844 }
    expect(fitBounds(cards[0], () => route, phone)).toEqual({ x: 0, y: -40, width: 1280, height: 700 })
  })

  it('leaves the box alone when the fit stays in the near view', () => {
    const wide = { width: 1440, height: 900 }
    let asked = false
    const box = fitBounds(cards[0], () => ((asked = true), route), wide)
    expect(box).toEqual(cards[0])
    expect(asked).toBe(false)
  })

  it('leaves the box alone when the routes do not push the fit into the far view', () => {
    const map = { width: 800, height: 600 }
    const tall = { x: 0, y: 0, width: 800, height: 678 }
    const inside = { x: 10, y: 10, width: 100, height: 100 }
    expect(fitBounds(tall, () => inside, map)).toEqual(tall)
    expect(fitBounds(tall, () => ({ x: 790, y: 0, width: 40, height: 40 }), map)).toEqual(tall)
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

describe('opening a board with many parts', () => {
  it('fits the whole of it, however small that makes the text', () => {
    const view = frameViewport(zoomLimits(board, map), { ...map, top: 0 }, { readable: true, fitAll: true })
    expect(view.zoom).toBeLessThan(READABLE_ZOOM)
    expect(view.zoom).toBeCloseTo(zoomLimits(board, map).fitZoom, 6)
  })

  it('frames the box it is given, not a far mark in the limits', () => {
    const parts = { x: 0, y: 0, width: 2000, height: 1000 }
    const far = contentBounds([parts], [], [{ kind: 'sticky', x: -9000, y: 0, width: 100, height: 100 } as never])
    const view = frameViewport(zoomLimits(far, map), { ...map, top: 0 }, { readable: true, fitAll: true, box: parts })
    // The parts, not the empty space toward the far mark, are in the middle of the view.
    const middle = (map.width / 2 - view.x) / view.zoom
    expect(middle).toBeGreaterThan(900)
    expect(middle).toBeLessThan(1100)
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

describe('viewportFor', () => {
  const area = { ...map, top: 40 }
  const card = { width: 240, height: 112 }

  it('leaves a part that is well inside the map alone', () => {
    expect(viewportFor({ x: 0, y: 0, zoom: 1 }, area, { x: 300, y: 300, ...card })).toBeUndefined()
  })

  it('never leaves a part flush against an edge', () => {
    for (const at of [{ x: 4, y: 300 }, { x: 300, y: 44 }, { x: 740, y: 300 }, { x: 300, y: 580 }]) {
      const v = viewportFor({ x: 0, y: 0, zoom: 1 }, area, { ...at, ...card })
      expect(v).toBeDefined()
      const left = at.x + v!.x
      const top = at.y + v!.y
      expect(left).toBeGreaterThanOrEqual(SELECT_ROOM - 0.5)
      expect(left + card.width).toBeLessThanOrEqual(map.width - SELECT_ROOM + 0.5)
      expect(top).toBeGreaterThanOrEqual(area.top + SELECT_ROOM - 0.5)
      expect(top + card.height).toBeLessThanOrEqual(map.height - SELECT_ROOM + 0.5)
    }
  })

  it('zooms in on a part that is too small to read and centers it', () => {
    const v = viewportFor({ x: 0, y: 0, zoom: 0.3 }, area, { x: 900, y: 500, ...card })!
    expect(v.zoom).toBe(LEGIBLE_ZOOM)
    expect(900 * v.zoom + v.x + (card.width * v.zoom) / 2).toBeCloseTo(map.width / 2, 5)
  })

  it('keeps a zoom that is already readable', () => {
    expect(viewportFor({ x: 0, y: 0, zoom: 1.5 }, area, { x: -900, y: 100, ...card })!.zoom).toBe(1.5)
  })
})

describe('framing with a floor zoom', () => {
  const limits = zoomLimits(board, map)

  it('keeps a box that fits at its own zoom', () => {
    const view = frameViewport(limits, { ...map, top: 0 }, { box: { x: 100, y: 100, width: 400, height: 300 }, padding: 0.1, floorZoom: 0.8 })
    expect(view.zoom).toBeGreaterThanOrEqual(0.8)
  })

  it('shows the top left of a box that is too big, at the floor zoom', () => {
    const view = frameViewport(limits, { ...map, top: 0 }, { box: { x: 200, y: 100, width: 1800, height: 900 }, floorZoom: 0.8 })
    expect(view.zoom).toBeCloseTo(0.8, 6)
    expect(200 * view.zoom + view.x).toBeGreaterThanOrEqual(0)
    expect(200 * view.zoom + view.x).toBeLessThan(map.width / 2)
  })
})
