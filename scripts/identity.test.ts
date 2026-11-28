import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const html = read('index.html')
const tokens = read('src/styles/tokens.css')

/** The value of a custom property inside the block of one theme in `tokens.css`. */
function token(name: string, theme: 'light' | 'dark'): string {
  const block = theme === 'light' ? /:root,\s*:root\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/.exec(tokens) : /:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/.exec(tokens)
  const value = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block?.[1] ?? '')
  if (!value) throw new Error(`no ${name} in the ${theme} theme`)
  return value[1]!.toLowerCase()
}

const tags = (name: string) => [...html.matchAll(new RegExp(`<${name}\\s[^>]*>`, 'g'))].map((m) => m[0])
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]

describe('the icon of the page', () => {
  const icon = tags('link').find((t) => attr(t, 'rel') === 'icon')

  it('is an SVG file that the page links by a path Vite rewrites for a base path', () => {
    expect(icon).toBeDefined()
    expect(attr(icon!, 'type')).toBe('image/svg+xml')
    // An absolute path in the page source: Vite puts the base path in front of it, so the hosted copy finds it under /Anatomy/.
    expect(attr(icon!, 'href')).toMatch(/^\/[\w-]+\.svg$/)
    expect(existsSync(join(root, 'public', attr(icon!, 'href')!.slice(1)))).toBe(true)
  })

  it('does not stay the empty data address of a page with no icon', () => {
    expect(html).not.toContain('href="data:,"')
  })

  it('draws one path in the text color of each theme, and switches with the color scheme of the browser', () => {
    const svg = read(`public/${attr(icon!, 'href')!.slice(1)}`)
    expect(svg).toMatch(/^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 24 24"/)
    // One flat ink and nothing else: no tile, no background, no border, no second part.
    expect([...svg.matchAll(/<(path|rect|circle|ellipse|line|polyline|polygon|g|use)\b/g)].map((m) => m[1])).toEqual(['path'])
    expect(svg).not.toMatch(/stroke/)
    const [light, dark] = svg.split('@media (prefers-color-scheme: dark)')
    expect(dark, 'a rule for the dark scheme').toBeDefined()
    const hex = (text: string) => [...new Set([...text.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()))]
    expect(hex(light!)).toEqual([token('--fg', 'light')])
    expect(hex(dark!)).toEqual([token('--fg', 'dark')])
    // Nothing in it reaches out: no script, no link, no external image.
    expect(svg).not.toMatch(/<script|href=|url\(|<image|<foreignObject/i)
  })
})

describe('the theme color of the page', () => {
  const metas = tags('meta').filter((t) => attr(t, 'name') === 'theme-color')

  it('has one for each color scheme, in the color of the top bar of that theme', () => {
    expect(metas).toHaveLength(2)
    const byScheme = new Map(metas.map((m) => [attr(m, 'media'), attr(m, 'content')?.toLowerCase()]))
    expect(byScheme.get('(prefers-color-scheme: light)')).toBe(token('--frame', 'light'))
    expect(byScheme.get('(prefers-color-scheme: dark)')).toBe(token('--frame', 'dark'))
  })

  it('is set again by the script that sets the theme before the first paint', () => {
    expect(read('public/theme.js')).toContain('theme-color')
  })
})
