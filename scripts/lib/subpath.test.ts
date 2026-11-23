import { describe, expect, it } from 'vitest'
import { fileForUrl } from './subpath.ts'

describe('fileForUrl', () => {
  const base = '/Anatomy/'

  it('maps the subpath itself to the page', () => {
    expect(fileForUrl(base, '/Anatomy/')).toBe('index.html')
  })

  it('maps a file under the subpath to its path inside the build', () => {
    expect(fileForUrl(base, '/Anatomy/theme.js')).toBe('theme.js')
    expect(fileForUrl(base, '/Anatomy/assets/index-abc.js')).toBe('assets/index-abc.js')
  })

  it('ignores the query and the fragment', () => {
    expect(fileForUrl(base, '/Anatomy/assets/a.js?v=1#top')).toBe('assets/a.js')
  })

  it('serves nothing outside the subpath, so a path that assumes the site root is a miss', () => {
    expect(fileForUrl(base, '/')).toBeUndefined()
    expect(fileForUrl(base, '/theme.js')).toBeUndefined()
    expect(fileForUrl(base, '/assets/index-abc.js')).toBeUndefined()
    expect(fileForUrl(base, '/Anatomy')).toBeUndefined()
    expect(fileForUrl(base, '/AnatomyX/theme.js')).toBeUndefined()
  })

  it('is case sensitive, like GitHub Pages', () => {
    expect(fileForUrl(base, '/anatomy/theme.js')).toBeUndefined()
  })

  it('never leaves the build folder', () => {
    expect(fileForUrl(base, '/Anatomy/../package.json')).toBeUndefined()
    expect(fileForUrl(base, '/Anatomy/assets/../../package.json')).toBeUndefined()
    expect(fileForUrl(base, '/Anatomy/%2e%2e/package.json')).toBeUndefined()
    expect(fileForUrl(base, '/Anatomy/assets/%2e%2e%2f%2e%2e%2fpackage.json')).toBeUndefined()
    expect(fileForUrl(base, '/Anatomy/..%5cpackage.json')).toBeUndefined()
    expect(fileForUrl(base, '/Anatomy/a%00b')).toBeUndefined()
  })

  it('refuses a path that is not valid percent encoding', () => {
    expect(fileForUrl(base, '/Anatomy/%E0%A4%A')).toBeUndefined()
  })

  it('works for a base that is not the one of the demo', () => {
    expect(fileForUrl('/a/b/', '/a/b/x.js')).toBe('x.js')
    expect(fileForUrl('/a/b/', '/a/x.js')).toBeUndefined()
  })
})
