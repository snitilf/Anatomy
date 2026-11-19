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

  it('holds each length on screen in the far view', () => {
    expect(screenDash('7 3 1.5 3')).toBe('calc(7px * var(--label-scale, 1)) calc(3px * var(--label-scale, 1)) calc(1.5px * var(--label-scale, 1)) calc(3px * var(--label-scale, 1))')
    expect(screenDash('  6   4 ')).toBe('calc(6px * var(--label-scale, 1)) calc(4px * var(--label-scale, 1))')
    expect(screenDash('')).toBe('')
    expect(YOURS_FAR_DASH).toBe(screenDash(YOURS_DASH))
  })
})
