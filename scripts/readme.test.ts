import { existsSync, readFileSync } from 'node:fs'
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
    for (const path of paths) expect(existsSync(join(root, path)), `${path} does not exist`).toBe(true)
  })

  it('has no em dash', () => {
    expect(readme).not.toContain('—')
  })
})
