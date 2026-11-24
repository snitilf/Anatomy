import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type Rgba = { r: number; g: number; b: number; a: number }

const TOKENS_PATH = resolve(process.cwd(), 'src/styles/tokens.css')
const tokensCss = readFileSync(TOKENS_PATH, 'utf8')

function extractThemeBlock(selector: string): Record<string, string> {
  const index = tokensCss.indexOf(selector)
  if (index === -1) throw new Error(`Missing selector ${selector} in tokens.css`)
  const open = tokensCss.indexOf('{', index)
  const close = tokensCss.indexOf('}', open)
  const body = tokensCss.slice(open + 1, close)
  const tokens: Record<string, string> = {}
  for (const match of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match
    if (name && value) tokens[name] = value.trim()
  }
  return tokens
}

function parseColor(raw: string): Rgba {
  const value = raw.trim()
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    const n = Number.parseInt(value.slice(1), 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const rgb = value.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/)
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: Number(rgb[4]),
    }
  }
  throw new Error(`Unsupported color syntax: ${raw}`)
}

function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  }
}

function mixSrgb(a: Rgba, b: Rgba, weightA: number): Rgba {
  return {
    r: a.r * weightA + b.r * (1 - weightA),
    g: a.g * weightA + b.g * (1 - weightA),
    b: a.b * weightA + b.b * (1 - weightA),
    a: 1,
  }
}

function srgbToLinear(channel: number): number {
  const s = channel / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(color: Rgba): number {
  return 0.2126 * srgbToLinear(color.r) + 0.7152 * srgbToLinear(color.g) + 0.0722 * srgbToLinear(color.b)
}

function contrastRatio(a: Rgba, b: Rgba): number {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

function rgbToOklch(color: Rgba): { L: number; C: number; H: number } {
  const lr = srgbToLinear(color.r)
  const lg = srgbToLinear(color.g)
  const lb = srgbToLinear(color.b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.hypot(a, b)
  let H = (Math.atan2(b, a) * 180) / Math.PI
  if (H < 0) H += 360
  return { L, C, H }
}

function token(block: Record<string, string>, name: string): string {
  const value = block[name]
  if (!value) throw new Error(`Missing token ${name}`)
  return value
}

const light = extractThemeBlock(":root[data-theme='light']")
const dark = extractThemeBlock(":root[data-theme='dark']")

describe('light theme surface separation and chroma', () => {
  it('separates cards from the canvas ground by at least 0.065 OKLCH lightness', () => {
    const bg = rgbToOklch(parseColor(token(light, '--bg')))
    const raised = rgbToOklch(parseColor(token(light, '--raised')))
    expect(raised.L).toBeGreaterThanOrEqual(0.995)
    expect(raised.L - bg.L).toBeGreaterThanOrEqual(0.065)
  })

  it('keeps the canvas, shell, and frame grounds cool and low-chroma without a lavender cast', () => {
    const bg = rgbToOklch(parseColor(token(light, '--bg')))
    const panel = rgbToOklch(parseColor(token(light, '--panel')))
    const frame = rgbToOklch(parseColor(token(light, '--frame')))

    expect(bg.C).toBeLessThanOrEqual(0.006)
    expect(panel.C).toBeLessThanOrEqual(0.007)
    expect(frame.C).toBeLessThanOrEqual(0.007)

    // Cool slate-violet hue family (D38 / D122).
    expect(bg.H).toBeGreaterThanOrEqual(250)
    expect(bg.H).toBeLessThanOrEqual(290)
    expect(panel.H).toBeGreaterThanOrEqual(250)
    expect(panel.H).toBeLessThanOrEqual(290)
    expect(frame.H).toBeGreaterThanOrEqual(250)
    expect(frame.H).toBeLessThanOrEqual(290)

    // Strict elevation order: frame < panel < bg < raised.
    expect(frame.L).toBeLessThan(panel.L)
    expect(panel.L).toBeLessThan(bg.L)
    expect(bg.L).toBeLessThan(rgbToOklch(parseColor(token(light, '--raised'))).L)
  })
})

describe('light theme amber tokens', () => {
  it('keeps --yours in a clean amber hue and chroma range instead of brown', () => {
    const yours = rgbToOklch(parseColor(token(light, '--yours')))
    expect(yours.H).toBeGreaterThanOrEqual(68)
    expect(yours.H).toBeLessThanOrEqual(78)
    expect(yours.C).toBeGreaterThanOrEqual(0.135)
    expect(yours.C).toBeLessThanOrEqual(0.175)
  })

  it('keeps --yours-text and --yours-ink in the same clean amber hue range', () => {
    const yoursText = rgbToOklch(parseColor(token(light, '--yours-text')))
    const yoursInk = rgbToOklch(parseColor(token(light, '--yours-ink')))

    expect(yoursText.H).toBeGreaterThanOrEqual(68)
    expect(yoursText.H).toBeLessThanOrEqual(78)
    expect(yoursInk.H).toBeGreaterThanOrEqual(68)
    expect(yoursInk.H).toBeLessThanOrEqual(78)
  })
})

describe('contrast matrix', () => {
  const textTokens = ['--fg', '--fg-2', '--fg-3', '--accent-text', '--yours-text', '--danger'] as const
  const surfaces = ['--bg', '--panel', '--frame', '--raised'] as const
  const fills = [null, '--hover', '--active'] as const
  const tints = [null, '--accent-tint', '--yours-tint', '--danger-tint'] as const

  it('passes 4.5:1 for every light text token on every surface, fill, tint, and combination', () => {
    const failures: string[] = []
    for (const surface of surfaces) {
      const base = parseColor(token(light, surface))
      for (const fill of fills) {
        const withFill = fill ? composite(parseColor(token(light, fill)), base) : base
        for (const tint of tints) {
          const finalBg = tint ? composite(parseColor(token(light, tint)), withFill) : withFill
          for (const fg of textTokens) {
            const ratio = contrastRatio(parseColor(token(light, fg)), finalBg)
            if (ratio < 4.5) {
              const label = `${fg} on ${surface}${fill ? `+${fill}` : ''}${tint ? `+${tint}` : ''}`
              failures.push(`${label} (${ratio.toFixed(2)}:1)`)
            }
          }
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('passes contrast for light UI graphics, button labels, and sticky notes', () => {
    const yoursInk = parseColor(token(light, '--yours-ink'))
    expect(contrastRatio(yoursInk, parseColor(token(light, '--panel')))).toBeGreaterThanOrEqual(3.5)
    expect(contrastRatio(yoursInk, parseColor(token(light, '--bg')))).toBeGreaterThanOrEqual(3.5)
    expect(contrastRatio(yoursInk, parseColor(token(light, '--raised')))).toBeGreaterThanOrEqual(3.5)

    const yours = parseColor(token(light, '--yours'))
    expect(contrastRatio(yours, parseColor(token(light, '--raised')))).toBeGreaterThanOrEqual(3.0)

    const onAccent = parseColor(token(light, '--on-accent'))
    expect(contrastRatio(onAccent, parseColor(token(light, '--accent')))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(onAccent, parseColor(token(light, '--danger-fill')))).toBeGreaterThanOrEqual(4.5)

    const stickyMix = Number.parseFloat(token(light, '--sticky-mix')) / 100
    const stickyBg = mixSrgb(yours, parseColor(token(light, '--raised')), stickyMix)
    expect(contrastRatio(parseColor(token(light, '--fg')), stickyBg)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps dark theme contrast and values intact', () => {
    // Dark theme values stay unchanged.
    expect(token(dark, '--bg')).toBe('#181920')
    expect(token(dark, '--panel')).toBe('#12131a')
    expect(token(dark, '--frame')).toBe('#0b0c11')
    expect(token(dark, '--raised')).toBe('#2e3141')
    expect(token(dark, '--yours')).toBe('#e8a33d')
    expect(token(dark, '--yours-text')).toBe('#f0b45a')
    expect(token(dark, '--yours-ink')).toBe('#e8a33d')

    const failures: string[] = []
    for (const surface of surfaces) {
      const base = parseColor(token(dark, surface))
      for (const fill of fills) {
        const withFill = fill ? composite(parseColor(token(dark, fill)), base) : base
        for (const fg of textTokens) {
          const ratio = contrastRatio(parseColor(token(dark, fg)), withFill)
          if (ratio < 4.5) {
            failures.push(`${fg} on ${surface}${fill ? `+${fill}` : ''} (${ratio.toFixed(2)}:1)`)
          }
        }
      }
      for (const tint of tints) {
        if (!tint) continue
        const withTint = composite(parseColor(token(dark, tint)), base)
        for (const fg of textTokens) {
          const ratio = contrastRatio(parseColor(token(dark, fg)), withTint)
          if (ratio < 4.5) {
            failures.push(`${fg} on ${surface}+${tint} (${ratio.toFixed(2)}:1)`)
          }
        }
      }
    }
    expect(failures).toEqual([])

    const yoursInk = parseColor(token(dark, '--yours-ink'))
    expect(contrastRatio(yoursInk, parseColor(token(dark, '--panel')))).toBeGreaterThanOrEqual(3.5)
    expect(contrastRatio(yoursInk, parseColor(token(dark, '--raised')))).toBeGreaterThanOrEqual(3.5)

    const onAccent = parseColor(token(dark, '--on-accent'))
    expect(contrastRatio(onAccent, parseColor(token(dark, '--accent')))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(onAccent, parseColor(token(dark, '--danger-fill')))).toBeGreaterThanOrEqual(4.5)
  })
})
