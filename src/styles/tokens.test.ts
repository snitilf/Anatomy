import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type Rgba = { r: number; g: number; b: number; a: number }

const TOKENS_PATH = resolve(process.cwd(), 'src/styles/tokens.css')
// Comments are stripped so a note that names an old value or a brace cannot change what the tests read.
const tokensCss = readFileSync(TOKENS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function extractThemeBlock(selector: string): Record<string, string> {
  const index = tokensCss.indexOf(selector)
  if (index === -1) throw new Error(`Missing selector ${selector} in tokens.css`)
  const open = tokensCss.indexOf('{', index)
  const close = tokensCss.indexOf('}', open)
  if (open === -1 || close === -1) throw new Error(`Unclosed block for ${selector} in tokens.css`)
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

// A group wash is the text color at a small share over the ground, as `GroupNode.module.css` draws it.
function wash(block: Record<string, string>, share: '--wash-share' | '--wash-share-2'): Rgba {
  const fg = parseColor(token(block, '--fg'))
  return composite({ ...fg, a: Number.parseFloat(token(block, share)) / 100 }, parseColor(token(block, '--bg')))
}

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

    // Cool grey hue family.
    expect(bg.H).toBeGreaterThanOrEqual(250)
    expect(bg.H).toBeLessThanOrEqual(290)
    expect(panel.H).toBeGreaterThanOrEqual(250)
    expect(panel.H).toBeLessThanOrEqual(290)
    expect(frame.H).toBeGreaterThanOrEqual(250)
    expect(frame.H).toBeLessThanOrEqual(290)
  })

  it('steps from the frame to the canvas, the shell, and the cards, each step wide enough to see without a border', () => {
    const L = (name: string) => rgbToOklch(parseColor(token(light, name))).L
    expect(L('--bg') - L('--frame')).toBeGreaterThanOrEqual(0.03)
    expect(L('--panel') - L('--bg')).toBeGreaterThanOrEqual(0.04)
    expect(L('--raised') - L('--panel')).toBeGreaterThanOrEqual(0.02)
  })

  it('shows a group area, a hover, and a press as a step of their own on the ground under them', () => {
    const L = (color: Rgba) => rgbToOklch(color).L
    const bg = parseColor(token(light, '--bg'))
    expect(L(bg) - L(wash(light, '--wash-share'))).toBeGreaterThanOrEqual(0.035)
    for (const surface of ['--bg', '--panel', '--frame', '--raised'] as const) {
      const base = parseColor(token(light, surface))
      const hover = composite(parseColor(token(light, '--hover')), base)
      const active = composite(parseColor(token(light, '--active')), base)
      expect(L(base) - L(hover)).toBeGreaterThanOrEqual(0.03)
      expect(L(hover) - L(active)).toBeGreaterThanOrEqual(0.015)
    }
  })
})

describe('accent', () => {
  const themes = [
    ['light', light],
    ['dark', dark],
  ] as const

  it('is a blue, clear of violet, and opposite the amber of the user', () => {
    for (const [, block] of themes) {
      const yours = rgbToOklch(parseColor(token(block, '--yours')))
      for (const name of ['--accent', '--accent-text', '--accent-line', '--accent-tint', '--focus']) {
        const hue = rgbToOklch({ ...parseColor(token(block, name)), a: 1 }).H
        expect(hue).toBeGreaterThanOrEqual(250)
        expect(hue).toBeLessThanOrEqual(264)
        const apart = Math.abs(hue - yours.H)
        expect(Math.min(apart, 360 - apart)).toBeGreaterThanOrEqual(150)
      }
    }
  })

  it('holds 3:1 as a selection edge and as a focus ring on every ground a card or a control sits on', () => {
    const failures: string[] = []
    for (const [theme, block] of themes) {
      const grounds: Array<[string, Rgba]> = [
        ['--bg', parseColor(token(block, '--bg'))],
        ['--panel', parseColor(token(block, '--panel'))],
        ['--frame', parseColor(token(block, '--frame'))],
        ['--wash-share', wash(block, '--wash-share')],
      ]
      for (const [name, ground] of grounds) {
        const edge = contrastRatio(parseColor(token(block, '--accent')), ground)
        if (edge < 3) failures.push(`${theme}: --accent on ${name} (${edge.toFixed(2)}:1)`)
        const ring = contrastRatio(composite(parseColor(token(block, '--focus')), ground), ground)
        if (ring < 3) failures.push(`${theme}: --focus on ${name} (${ring.toFixed(2)}:1)`)
      }
      const raised = parseColor(token(block, '--raised'))
      const ring = contrastRatio(composite(parseColor(token(block, '--focus')), raised), raised)
      if (ring < 3) failures.push(`${theme}: --focus on --raised (${ring.toFixed(2)}:1)`)
    }
    expect(failures).toEqual([])
  })

  it('keeps the words of a selected connection at 4.5:1 on the ground and on a single and an overlapping group wash', () => {
    for (const [, block] of themes) {
      const line = parseColor(token(block, '--accent-line'))
      expect(contrastRatio(line, parseColor(token(block, '--bg')))).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(line, wash(block, '--wash-share'))).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(line, wash(block, '--wash-share-2'))).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('light theme amber tokens', () => {
  it('keeps --yours in a clean amber hue and chroma range instead of brown', () => {
    const yours = rgbToOklch(parseColor(token(light, '--yours')))
    expect(yours.H).toBeGreaterThanOrEqual(68)
    expect(yours.H).toBeLessThanOrEqual(78)
    expect(yours.C).toBeGreaterThanOrEqual(0.125)
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

  it('passes 4.5:1 for every light text token on a single and an overlapping group wash', () => {
    const failures: string[] = []
    for (const share of ['--wash-share', '--wash-share-2'] as const) {
      const ground = wash(light, share)
      for (const fg of textTokens) {
        const ratio = contrastRatio(parseColor(token(light, fg)), ground)
        if (ratio < 4.5) failures.push(`${fg} on ${share} (${ratio.toFixed(2)}:1)`)
      }
    }
    expect(failures).toEqual([])
  })

  it('keeps the user color at 3:1 on every ground where marks and icons sit', () => {
    const yours = parseColor(token(light, '--yours'))
    const grounds: Array<[string, Rgba]> = [
      ['--bg', parseColor(token(light, '--bg'))],
      ['--panel', parseColor(token(light, '--panel'))],
      ['--raised', parseColor(token(light, '--raised'))],
      ['--wash-share', wash(light, '--wash-share')],
    ]
    const failures = grounds
      .map(([name, ground]) => [name, contrastRatio(yours, ground)] as const)
      .filter(([, ratio]) => ratio < 3)
      .map(([name, ratio]) => `--yours on ${name} (${ratio.toFixed(2)}:1)`)
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

  describe('faded line labels', () => {
    // A faded label keeps its cutout and steps back only by the color of its words: the label ink at `--faded-label`
    // over the cutout. The cutout is the map color with the group areas under the label painted again on it,
    // so it is the ground, one group wash, or two overlapping ones. `--yours-text` fades the same way while a sidebar row is pointed at.
    const themes = [
      ['light', light],
      ['dark', dark],
    ] as const
    const inks = ['--fg-2', '--yours-text'] as const
    const grounds = ['--bg', '--wash-share', '--wash-share-2'] as const

    function ground(block: Record<string, string>, name: (typeof grounds)[number]): Rgba {
      return name === '--bg' ? parseColor(token(block, '--bg')) : wash(block, name)
    }

    function faded(block: Record<string, string>, ink: string, under: Rgba): Rgba {
      const share = Number.parseFloat(token(block, '--faded-label')) / 100
      return composite({ ...parseColor(token(block, ink)), a: share }, under)
    }

    it('passes 4.5:1 on the ground and on a single and an overlapping group wash, in both themes', () => {
      const failures: string[] = []
      for (const [theme, block] of themes) {
        for (const name of grounds) {
          const under = ground(block, name)
          for (const ink of inks) {
            const ratio = contrastRatio(faded(block, ink, under), under)
            if (ratio < 4.5) failures.push(`${theme}: ${ink} at --faded-label on ${name} (${ratio.toFixed(2)}:1)`)
          }
        }
      }
      expect(failures).toEqual([])
    })

    it('stays clearly behind the labels a walkthrough lights, which use --fg', () => {
      for (const [, block] of themes) {
        expect(Number.parseFloat(token(block, '--faded-label'))).toBeLessThan(100)
        for (const name of grounds) {
          const under = ground(block, name)
          const lit = contrastRatio(parseColor(token(block, '--fg')), under)
          const dimmed = contrastRatio(faded(block, '--fg-2', under), under)
          expect(lit / dimmed).toBeGreaterThanOrEqual(1.75)
        }
      }
    })

    it('models what the map draws: the label ink at --faded-label on a cutout of the ground and --wash-share areas', () => {
      const css = readFileSync(resolve(process.cwd(), 'src/canvas/RelationshipEdge.module.css'), 'utf8')
      const rule = (selector: string) => {
        const start = css.indexOf(`${selector} {`)
        if (start === -1) throw new Error(`Missing rule ${selector}`)
        return css.slice(start, css.indexOf('}', start))
      }
      expect(rule('.pill[data-dimmed]')).toContain('color: color-mix(in srgb, var(--fg-2) var(--faded-label), transparent);')
      expect(rule('.backdrop')).toContain('background: var(--bg);')
      expect(rule('.tint')).toContain('background: color-mix(in srgb, var(--fg) var(--wash-share), transparent);')
      // Two tints over each other are the overlapping wash.
      for (const [, block] of themes) {
        const one = Number.parseFloat(token(block, '--wash-share')) / 100
        const two = Number.parseFloat(token(block, '--wash-share-2')) / 100
        expect(1 - (1 - one) ** 2).toBeCloseTo(two, 3)
      }
      const emphasis = readFileSync(resolve(process.cwd(), 'src/canvas/emphasis.ts'), 'utf8')
      expect(emphasis).toContain('color: color-mix(in srgb, var(--fg-2) var(--faded-label), transparent);')
      expect(emphasis).toContain('color: color-mix(in srgb, var(--yours-text) var(--faded-label), transparent);')
    })
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
