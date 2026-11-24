import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import baseline from './controls.baseline.json'

/*
 * One file owns each kind of control: buttons, list rows, and the segmented control. Every other style sheet reaches
 * them through a shared class. This ratchet counts what is left by hand, and each slice that adopts the shared
 * classes lowers the numbers in controls.baseline.json. A count may fall; it must not rise.
 */
const ROOT = resolve(process.cwd(), 'src')
const OWNERS = ['src/app/buttons.module.css', 'src/app/rows.module.css', 'src/app/Segmented.module.css']
const CONTROL_TOKENS = ['--control-sm', '--control-md', '--control-lg', '--row-sm', '--row-md'] as const

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return cssFiles(path)
    return entry.name.endsWith('.css') ? [path] : []
  })
}

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Every style sheet in src except the three that own a kind of control, with comments removed. */
const sheets = cssFiles(ROOT)
  .map((path) => ({ file: relative(process.cwd(), path), css: strip(readFileSync(path, 'utf8')) }))
  .filter((sheet) => !OWNERS.includes(sheet.file))

const count = (pattern: RegExp) => sheets.reduce((total, sheet) => total + (sheet.css.match(pattern)?.length ?? 0), 0)

describe('the control ratchet', () => {
  it('has at most as many hand-written appearance resets as recorded, outside the three owner files', () => {
    expect(count(/appearance:\s*none/g)).toBeLessThanOrEqual(baseline.appearanceNone)
  })

  it('has at most as many hand-written 28px control heights as recorded, outside the three owner files', () => {
    // A height, a minimum height, or the row height variable, set to 28px by hand (or through the row variable's fallback).
    expect(count(/(?:^|[\s;{])(?:min-)?height:\s*(?:var\(--row,\s*)?28px|--row:\s*28px/g)).toBeLessThanOrEqual(baseline.height28)
  })

  it('names the three owner files, and they exist', () => {
    const present = cssFiles(ROOT).map((path) => relative(process.cwd(), path))
    for (const owner of OWNERS) expect(present, `${owner} is missing`).toContain(owner)
  })
})

describe('the control tokens', () => {
  const tokens = strip(readFileSync(resolve(ROOT, 'styles/tokens.css'), 'utf8'))
  const coarse = tokens.slice(tokens.indexOf('@media (pointer: coarse)'))
  const fine = tokens.slice(0, tokens.indexOf('@media (pointer: coarse)'))
  const px = (css: string, name: string) => {
    const match = css.match(new RegExp(`${name}:\\s*(\\d+)px`))
    return match ? Number(match[1]) : undefined
  }

  it('defines every control token for a fine pointer', () => {
    for (const name of CONTROL_TOKENS) expect(px(fine, name), `${name} for a fine pointer`).toBeTypeOf('number')
  })

  it('defines every control token again for a coarse pointer, and never smaller', () => {
    for (const name of CONTROL_TOKENS) {
      expect(px(coarse, name), `${name} for a coarse pointer`).toBeTypeOf('number')
      expect(px(coarse, name)!).toBeGreaterThanOrEqual(px(fine, name)!)
    }
  })

  it('sets the control sizes of the button system: 24, 28, 32 with a fine pointer, and 32, 36, 44 with a coarse one', () => {
    expect(['--control-sm', '--control-md', '--control-lg'].map((name) => px(fine, name))).toEqual([24, 28, 32])
    expect(['--control-sm', '--control-md', '--control-lg'].map((name) => px(coarse, name))).toEqual([32, 36, 44])
  })

  it('sets the row sizes: 28 and 32 with a fine pointer, and 44 for both with a coarse one', () => {
    expect([px(fine, '--row-sm'), px(fine, '--row-md')]).toEqual([28, 32])
    expect([px(coarse, '--row-sm'), px(coarse, '--row-md')]).toEqual([44, 44])
  })

  it('makes the large control as tall as the coarse hit area, so the one main action needs no extra reach', () => {
    expect(px(coarse, '--hit')).toBe(44)
    expect(px(coarse, '--control-lg')).toBeGreaterThanOrEqual(px(coarse, '--hit')!)
  })

  it('defines the spacing, measure, and tracking tokens of the type roles', () => {
    expect(px(fine, '--space-10')).toBe(40)
    expect(px(fine, '--space-12')).toBe(48)
    expect(fine).toMatch(/--measure:\s*68ch/)
    expect(fine).toMatch(/--tracking-title:\s*-0\.015em/)
    expect(fine).toMatch(/--tracking-heading:\s*-0\.01em/)
    expect(fine).toMatch(/--tracking-label:\s*0\.01em/)
  })
})
