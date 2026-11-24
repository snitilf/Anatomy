import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const readme = readFileSync(join(root, 'README.md'), 'utf8')

/** The anchor GitHub gives a heading: lower case, punctuation dropped, spaces turned into hyphens. */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-')
}

function anchorsOf(markdown: string): Set<string> {
  const found = new Set<string>()
  for (const line of markdown.split('\n')) {
    const match = /^#{1,6}\s+(.*)$/.exec(line)
    if (match) found.add(slug((match[1] ?? '').replace(/<[^>]*>/g, '').replace(/[*`]/g, '')))
  }
  return found
}

const links = [...readme.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1] ?? '').filter((href) => !/^[a-z][a-z0-9+.-]*:/i.test(href))

describe('README.md', () => {
  it('has relative links and anchors that all resolve', () => {
    expect(links.length).toBeGreaterThan(0)
    for (const href of links) {
      const [path = '', anchor] = href.split('#')
      const target = path === '' ? join(root, 'README.md') : join(root, path)
      expect(existsSync(target), `${href} points at a file that does not exist`).toBe(true)
      if (anchor !== undefined && target.endsWith('.md')) {
        expect(anchorsOf(readFileSync(target, 'utf8')).has(anchor), `${href} points at a heading that does not exist`).toBe(true)
      }
    }
  })

  it('names only source files that exist', () => {
    const paths = [...readme.matchAll(/`((?:src|bin|scripts|e2e|docs|schema)\/[A-Za-z0-9_./-]+\.[a-z]+)`/g)].map((m) => m[1] ?? '')
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) expect(existsSync(join(root, path)), `${path} does not exist`).toBe(true)
  })

  it('has the "Under the hood" section before "How it works", and it cites existing source files', () => {
    const start = readme.indexOf('\n## Under the hood\n')
    const end = readme.indexOf('\n## How it works\n')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const cited = [...readme.slice(start, end).matchAll(/`((?:src|bin)\/[A-Za-z0-9_./-]+\.[a-z]+)`/g)].map((m) => m[1] ?? '')
    expect(cited.length).toBeGreaterThan(0)
    for (const path of cited) expect(existsSync(join(root, path)), `${path} does not exist`).toBe(true)
  })

  it('has no em dash', () => {
    expect(readme).not.toContain('\u2014')
  })
  describe('the picture under the tagline', () => {
    const picture = /<picture>([\s\S]*?)<\/picture>/.exec(readme)?.[1] ?? ''
    const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? ''
    const source = /<source\b[^>]*>/.exec(picture)?.[0] ?? ''
    const img = /<img\b[^>]*>/.exec(picture)?.[0] ?? ''

    it('comes right after the header block opens, before the description', () => {
      const at = readme.indexOf('<picture>')
      expect(at).toBeGreaterThan(readme.indexOf('Your coding agent knows your code'))
      expect(at).toBeLessThan(readme.indexOf('Anatomy is a local web app'))
    })

    it('has a dark source and a light image, and both files exist and are a sharp, small PNG', () => {
      expect(attr(source, 'media')).toBe('(prefers-color-scheme: dark)')
      for (const path of [attr(source, 'srcset'), attr(img, 'src')]) {
        expect(path, 'the picture names a file').toMatch(/^docs\/images\/[a-z-]+\.png$/)
        expect(existsSync(join(root, path)), `${path} does not exist`).toBe(true)
        const file = readFileSync(join(root, path))
        expect(file.subarray(1, 4).toString('latin1')).toBe('PNG')
        // Taken at 1440 wide with a device scale factor of 2.
        expect(file.readUInt32BE(16)).toBe(2880)
        expect(statSync(join(root, path)).size, `${path} is over 600 KB`).toBeLessThan(600 * 1024)
      }
      expect(attr(source, 'srcset')).not.toBe(attr(img, 'src'))
    })

    it('has a width, and alt text of one plain sentence', () => {
      expect(Number(attr(img, 'width'))).toBeGreaterThan(0)
      const alt = attr(img, 'alt')
      expect(alt.length).toBeGreaterThan(20)
      expect(alt.endsWith('.')).toBe(true)
      expect(alt.slice(0, -1)).not.toMatch(/[.!?]/)
      expect(alt).not.toMatch(/\b(image|picture|screenshot)\b/i)
    })
  })
})
