import { describe, expect, it } from 'vitest'
import { KIND_ORDER } from '../app/labels'
import { KIND_STYLE, MANUAL_STYLE, screenDash, YOURS_DASH, YOURS_FAR_DASH } from './kinds'

describe("the user's dash and dot", () => {
  it('is never the dash of a line the agent draws', () => {
    for (const kind of KIND_ORDER) expect(KIND_STYLE[kind].dash).not.toBe(YOURS_DASH)
  })

  it("draws the user's links", () => {
    expect(MANUAL_STYLE.dash).toBe(YOURS_DASH)
  })

  it('is never the dash of an agent line in the far view either', () => {
    for (const kind of KIND_ORDER) expect(screenDash(KIND_STYLE[kind].dash)).not.toBe(YOURS_FAR_DASH)
    // Each of its four lengths is held on screen by the far view's scale.
    expect(YOURS_FAR_DASH.match(/var\(--label-scale, 1\)/g)).toHaveLength(4)
  })
})
