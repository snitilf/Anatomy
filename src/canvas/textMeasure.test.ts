import { describe, expect, it, vi } from 'vitest'
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

  it('measures the whole string with the canvas when the browser has one and the font is loaded', () => {
    const calls: string[] = []
    class Fake {
      getContext() {
        return { font: '', measureText: (t: string) => (calls.push(t), { width: t.length * 10 }) }
      }
    }
    vi.stubGlobal('OffscreenCanvas', Fake)
    Object.defineProperty(document, 'fonts', { value: { check: () => true }, configurable: true })
    vi.resetModules()
    return import('./textMeasure').then((m) => {
      expect(m.textWidth('WWéé', 'label')).toBeCloseTo(40 * 1.03)
      expect(m.textWidth('WWéé', 'label')).toBeCloseTo(40 * 1.03)
      expect(calls).toEqual(['WWéé'])
      vi.unstubAllGlobals()
    })
  })

  it('does not keep a width taken before the font faces for the text are loaded, and tells listeners once they are', async () => {
    let ready = false
    let resolve = () => {}
    const load = vi.fn(() => new Promise<void>((r) => (resolve = () => ((ready = true), r()))))
    class Fake {
      getContext() {
        return { font: '', measureText: (t: string) => ({ width: t.length * 10 }) }
      }
    }
    vi.stubGlobal('OffscreenCanvas', Fake)
    Object.defineProperty(document, 'fonts', { value: { check: () => ready, load }, configurable: true })
    vi.resetModules()
    const m = await import('./textMeasure')
    const told = vi.fn()
    m.onTextMeasured(told)
    const text = '\u03bb'.repeat(20)
    const fallback = m.textWidth(text, 'label')
    m.textWidth(text, 'label')
    m.textWidth('\u03bb'.repeat(21), 'label')
    expect(load).toHaveBeenCalledTimes(2)
    expect(fallback).toBeCloseTo(20 * 11 * 0.6 * 1.03)
    resolve()
    await new Promise((r) => setTimeout(r, 0))
    expect(told).toHaveBeenCalledTimes(1)
    expect(m.textWidth(text, 'label')).toBeCloseTo(200 * 1.03)
    vi.unstubAllGlobals()
  })
})
