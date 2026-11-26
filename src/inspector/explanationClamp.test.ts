import { describe, expect, it } from 'vitest'
import { EXPLANATION_MAX, EXPLANATION_MIN_HIDDEN, explanationCut, type CutBlock } from './explanationClamp'

describe('the explanation clamp rule', () => {
  it('leaves an explanation uncut when it is at or under 320 px', () => {
    const blocks: CutBlock[] = [
      { top: 0, bottom: 160, splittable: true },
      { top: 168, bottom: 320, splittable: true },
    ]
    expect(EXPLANATION_MAX).toBe(320)
    expect(EXPLANATION_MIN_HIDDEN).toBe(40)
    expect(explanationCut(200, [{ top: 0, bottom: 200, splittable: true }])).toBeNull()
    expect(explanationCut(320, blocks)).toBeNull()
  })

  it('cuts between blocks when the explanation exceeds 320 px and at least 40 px is hidden', () => {
    const blocks: CutBlock[] = [
      { top: 0, bottom: 140, splittable: true },
      { top: 148, bottom: 280, splittable: true },
      { top: 288, bottom: 380, splittable: true },
    ]
    expect(explanationCut(380, blocks)).toBe(280)
  })

  it('never cuts inside a list item', () => {
    const blocks: CutBlock[] = [
      { top: 0, bottom: 100, splittable: true },
      { top: 108, bottom: 260, splittable: false },
      { top: 264, bottom: 344, splittable: false },
      { top: 348, bottom: 420, splittable: false },
    ]
    // The second list item crosses 320, so the cut falls cleanly after the first list item.
    expect(explanationCut(420, blocks)).toBe(260)
  })

  it('does not show a Show more cut when fewer than 40 px would be hidden', () => {
    const blocks: CutBlock[] = [
      { top: 0, bottom: 310, splittable: true },
      { top: 318, bottom: 349, splittable: true },
    ]
    // 349 - 310 = 39 px hidden, which is under 40 px.
    expect(explanationCut(349, blocks)).toBeNull()
    // Exactly 40 px hidden is enough to cut.
    expect(explanationCut(350, [{ top: 0, bottom: 310, splittable: true }, { top: 318, bottom: 350, splittable: true }])).toBe(310)
  })

  it('cuts a single tall paragraph on a whole line boundary, never inside a line', () => {
    const blocks: CutBlock[] = [{ top: 0, bottom: 410, splittable: true }]
    // At 20 px per line, 320 px is 16 full lines; 410 - 320 = 90 px hidden.
    expect(explanationCut(410, blocks, { lineHeight: 20 })).toBe(320)
    // At 22 px per line, 14 full lines = 308 px (never 320 inside line 15).
    expect(explanationCut(410, blocks, { lineHeight: 22 })).toBe(308)
    // Under 40 px hidden after the line boundary: stay uncut.
    expect(explanationCut(350, [{ top: 0, bottom: 350, splittable: true }], { lineHeight: 20 })).toBeNull()
  })

  it('leaves a single tall list item uncut rather than cutting inside it', () => {
    const blocks: CutBlock[] = [{ top: 0, bottom: 400, splittable: false }]
    expect(explanationCut(400, blocks, { lineHeight: 20 })).toBeNull()
  })
})
