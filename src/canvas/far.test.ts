import { describe, expect, it } from 'vitest'
import {
  detailFor,
  FAR_ENTER,
  FAR_EXIT,
  farLabelScale,
  hiddenDetailText,
  labelScale,
  nameLines,
  NAMED_TILE_PX,
  nextDetail,
  nextFar,
  TITLE_ENTER,
  TITLE_EXIT,
  TITLE_FOOT,
  TITLE_LEVEL_PX,
  TITLE_LINE_HEIGHT,
  TITLE_PADDING,
  titleLines,
  titleScale,
  type DetailLevel,
} from './far'

describe('the three detail levels and their thresholds', () => {
  it('orders the thresholds with a hysteresis band at each boundary', () => {
    expect(FAR_ENTER).toBeLessThan(FAR_EXIT)
    expect(FAR_EXIT).toBeLessThan(TITLE_ENTER)
    expect(TITLE_ENTER).toBeLessThan(TITLE_EXIT)
    expect(FAR_ENTER).toBeCloseTo(0.45, 2)
    expect(TITLE_ENTER).toBeCloseTo(0.75, 2)
  })

  it('picks the opening level from the fit zoom alone', () => {
    expect(detailFor(0.2)).toBe('far')
    expect(detailFor(FAR_ENTER - 0.01)).toBe('far')
    expect(detailFor(FAR_ENTER)).toBe('title')
    expect(detailFor(0.5)).toBe('title')
    expect(detailFor(TITLE_ENTER - 0.01)).toBe('title')
    expect(detailFor(TITLE_ENTER)).toBe('full')
    expect(detailFor(1)).toBe('full')
  })

  it('transitions cleanly across both boundaries in either direction', () => {
    expect(nextDetail('full', TITLE_ENTER - 0.01)).toBe('title')
    expect(nextDetail('title', TITLE_EXIT)).toBe('full')
    expect(nextDetail('title', FAR_ENTER - 0.01)).toBe('far')
    expect(nextDetail('far', FAR_EXIT)).toBe('title')
    expect(nextDetail('far', 1)).toBe('full')
    expect(nextDetail('full', 0.2)).toBe('far')
  })

  it('does not flip back and forth when a resize moves the zoom a few pixels at either threshold', () => {
    // Wobbling inside the title/full band stays at whichever level it entered from.
    let fromFull: DetailLevel = 'full'
    for (const zoom of [0.8, 0.76, 0.75, 0.77, 0.755, 0.765]) {
      fromFull = nextDetail(fromFull, zoom)
      expect(fromFull).toBe('full')
    }
    let fromTitle: DetailLevel = 'title'
    for (const zoom of [0.74, 0.76, 0.78, 0.75, 0.77, 0.74]) {
      fromTitle = nextDetail(fromTitle, zoom)
      expect(fromTitle).toBe('title')
    }
    // Wobbling inside the far/title band stays at whichever level it entered from.
    let stayTitle: DetailLevel = 'title'
    for (const zoom of [0.5, 0.46, 0.45, 0.48, 0.455, 0.47]) {
      stayTitle = nextDetail(stayTitle, zoom)
      expect(stayTitle).toBe('title')
    }
    let stayFar: DetailLevel = 'far'
    for (const zoom of [0.44, 0.46, 0.48, 0.45, 0.47, 0.44]) {
      stayFar = nextDetail(stayFar, zoom)
      expect(stayFar).toBe('far')
    }
  })

  it('keeps nextFar consistent with the far boundary', () => {
    expect(nextFar(false, FAR_ENTER)).toBe(false)
    expect(nextFar(false, FAR_ENTER - 0.01)).toBe(true)
    expect(nextFar(true, (FAR_ENTER + FAR_EXIT) / 2)).toBe(true)
    expect(nextFar(true, FAR_EXIT)).toBe(false)
  })
})

describe('readable text at every level', () => {
  it('keeps card titles at least 11 px on screen across full and title zooms', () => {
    for (const zoom of [0.45, 0.5, 0.55, 0.65, 0.75, 0.8, 0.85, 1, 1.5]) {
      const onScreen = 13 * titleScale(zoom) * zoom
      expect(onScreen).toBeGreaterThanOrEqual(11)
      if (zoom >= 0.85) expect(titleScale(zoom)).toBe(1)
    }
  })

  it('draws a title-only card a step above the 11 px line labels, at about 12 px on screen', () => {
    for (const zoom of [FAR_ENTER, 0.5, 0.55, 0.6, 0.65, 0.7, TITLE_ENTER, TITLE_EXIT - 0.001]) {
      const onScreen = 13 * titleScale(zoom, TITLE_LEVEL_PX) * zoom
      expect(onScreen).toBeGreaterThanOrEqual(TITLE_LEVEL_PX)
      expect(onScreen).toBeLessThan(TITLE_LEVEL_PX + 1)
    }
  })

  it('gives a title-only card only the title lines that fit inside it, from one to three', () => {
    for (const zoom of [FAR_ENTER, 0.5, 0.6, 0.7, TITLE_EXIT]) {
      for (const height of [72, 96, 112, 140, 200, 400]) {
        const lines = titleLines(zoom, height)
        expect(lines).toBeGreaterThanOrEqual(1)
        expect(lines).toBeLessThanOrEqual(3)
        const lineHeight = 13 * TITLE_LINE_HEIGHT * titleScale(zoom, TITLE_LEVEL_PX)
        if (lines > 1) expect(lines * lineHeight).toBeLessThanOrEqual(height - 2 * TITLE_PADDING)
      }
    }
    // A usual card holds two lines just above the far view and three near the full cards.
    expect(titleLines(FAR_ENTER, 112)).toBe(2)
    expect(titleLines(0.7, 112)).toBe(3)
  })

  it('keeps room under the title for the badges of a card that has them', () => {
    for (const zoom of [FAR_ENTER, 0.5, 0.6, 0.7, TITLE_EXIT]) {
      for (const height of [96, 112, 140, 200]) {
        const scale = titleScale(zoom, TITLE_LEVEL_PX)
        const lines = titleLines(zoom, height, true)
        expect(lines).toBeGreaterThanOrEqual(1)
        expect(lines).toBeLessThanOrEqual(titleLines(zoom, height))
        if (lines > 1) expect(lines * 13 * TITLE_LINE_HEIGHT * scale + TITLE_FOOT * scale).toBeLessThanOrEqual(height - 2 * TITLE_PADDING)
      }
    }
  })

  it('keeps line labels at least 11 px on screen at every zoom', () => {
    for (const zoom of [0.45, 0.5, 0.55, 0.65, 0.75, 0.85, 1, 1.5]) {
      const onScreen = 11 * labelScale(zoom, false) * zoom
      expect(onScreen).toBeGreaterThanOrEqual(11)
      if (zoom >= 1) expect(labelScale(zoom, false)).toBe(1)
    }
  })

  it('grows far-view labels in quarter steps so they hold their size on screen', () => {
    for (const zoom of [0.1, 0.18, 0.33, 0.44]) {
      const onScreen = farLabelScale(zoom) * zoom
      expect(onScreen).toBeGreaterThanOrEqual(1)
      expect(onScreen).toBeLessThan(1.3)
    }
  })
})

describe('saying what a view hides', () => {
  it('reports hidden lines and labels in the far view', () => {
    const text = hiddenDetailText('far', false, 0)
    expect(text).toBeTruthy()
    expect(text).toMatch(/line|label/i)
  })

  it('reports hidden labels when a crowded map hides them or placement holds some back', () => {
    expect(hiddenDetailText('title', true, 0)).toMatch(/label/i)
    expect(hiddenDetailText('full', true, 0)).toMatch(/label/i)
    expect(hiddenDetailText('full', false, 2)).toMatch(/2.*label/i)
    expect(hiddenDetailText('title', false, 1)).toMatch(/1.*label/i)
  })

  it('says nothing when all lines and labels are shown', () => {
    expect(hiddenDetailText('full', false, 0)).toBeUndefined()
    expect(hiddenDetailText('title', false, 0)).toBeUndefined()
  })
})

describe('names on tiles', () => {
  it('derives the width from the font, enough for eight letters before the ellipsis', () => {
    expect(NAMED_TILE_PX).toBeGreaterThanOrEqual(76)
    expect(NAMED_TILE_PX).toBeLessThanOrEqual(95)
  })

  it('names nothing on a narrow tile, one line on a short one, and two on a tall wide one', () => {
    expect(nameLines(0.18, 240, 112)).toBe(0)
    expect(nameLines(0.3, 240, 80)).toBe(0)
    expect(nameLines(0.45, 240, 40)).toBe(1)
    expect(nameLines(0.45, 240, 112)).toBe(2)
    expect(nameLines(0.36, 240, 112)).toBe(1)
  })
})
