import { describe, expect, it } from 'vitest'
import { charWidth, textWidth } from './textMeasure'

describe('textWidth', () => {
  it('has a width for every printable ASCII character', () => {
    for (let code = 32; code < 127; code++) {
      expect(charWidth(String.fromCharCode(code), 'label')).toBeGreaterThan(1)
      expect(charWidth(String.fromCharCode(code), 'title')).toBeGreaterThan(1)
    }
  })

  it('measures a phrase close to what the browser draws in the interface font', () => {
    // 108px at 11px Inter Variable, measured in Chrome, plus the allowance for kerning.
    expect(textWidth('Hello world and stuff', 'label')).toBeGreaterThan(108)
    expect(textWidth('Hello world and stuff', 'label')).toBeLessThan(114)
  })

  it('counts wide scripts and emoji as a full em', () => {
    expect(charWidth('日', 'label')).toBe(11)
    expect(charWidth('😀', 'title')).toBe(12)
  })
})
