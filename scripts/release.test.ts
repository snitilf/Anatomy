import { execFileSync, spawn } from 'node:child_process'
import { request } from 'node:http'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = process.cwd()
/** The text of a file of the repository. A missing file reads as a marker, so the test that needs it fails by itself and the others still run. */
const text = (path: string) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : `MISSING FILE ${path}`)
const json = (path: string) => JSON.parse(text(path)) as Record<string, unknown>

const pkg = json('package.json') as { version: string; scripts: Record<string, string> }
const lock = json('package-lock.json') as { version: string; packages: Record<string, { version?: string }> }
const release = text('.github/workflows/release.yml')
const ci = text('.github/workflows/ci.yml')

/** Every `uses:` line of a workflow, without its indentation. */
const usesOf = (workflow: string) => [...workflow.matchAll(/^\s*-?\s*uses:\s*(\S.*)$/gm)].map((m) => (m[1] ?? '').trim())

describe('the files of a release', () => {
  it('exist', () => {
    const files = [`docs/release-notes/${pkg.version}.md`, 'docs/release-checklist.md', 'scripts/package-release.ts', 'scripts/release/serve.mjs', 'scripts/release/README-run.txt']
    expect(files.filter((file) => !existsSync(join(root, file)))).toEqual([])
  })
})

describe('the version', () => {
  it('is 0.1.0 in package.json and in the lock file', () => {
    expect(pkg.version).toBe('0.1.0')
    expect(lock.version).toBe(pkg.version)
    expect(lock.packages['']?.version).toBe(pkg.version)
  })

  it('has release notes in plain language, with no em dash', () => {
    const notes = text(`docs/release-notes/${pkg.version}.md`)
    expect(notes.startsWith('# ')).toBe(true)
    expect(notes).toContain('node serve.mjs')
    expect(notes).not.toContain('\u2014')
  })
})

describe('the release workflow', () => {
  it('starts on a version tag only, and writes to the release and nothing else', () => {
    expect(release).toMatch(/tags:\s*\['v\*'\]/)
    expect(release).toMatch(/permissions:\s*\n\s*contents: write\s*\n/)
    expect(release.match(/^\s*[a-z-]+: (?:write|read)$/gm)).toHaveLength(1)
  })

  it('uses only the action versions that the CI workflow pins, by commit', () => {
    const used = usesOf(release)
    expect(used.length).toBeGreaterThan(2)
    const pinned = new Set(usesOf(ci))
    for (const line of used) {
      expect(line, 'a release action must be pinned by a full commit hash').toMatch(/@[0-9a-f]{40}\s+#/)
      expect(pinned.has(line), `${line} is not pinned in ci.yml`).toBe(true)
    }
  })

  it('runs on Node 24 and holds every gate that CI holds', () => {
    expect(release).toContain('node-version: 24')
    for (const gate of ['npm ci', 'npm run check', 'npm run build', 'npm run schema && git diff --exit-code -- schema/']) {
      expect(release, gate).toContain(`- run: ${gate}`)
      expect(ci, gate).toContain(`- run: ${gate}`)
    }
    const browserRun = /run: (npx playwright test '[^\n]*)/.exec(ci)?.[1]
    expect(browserRun).toBeDefined()
    expect(release).toContain(browserRun)
  })

  it('refuses a tag that is not the version in package.json', () => {
    expect(release).toMatch(/GITHUB_REF_NAME/)
    expect(release).toMatch(/package\.json/)
    expect(release.indexOf('package.json')).toBeLessThan(release.indexOf('npm ci'))
  })

  it('packages with the repository script, and publishes the notes file, not generated notes', () => {
    expect(release).toContain('scripts/package-release.ts')
    expect(release).toContain('--notes-file')
    expect(release).toContain('docs/release-notes/')
    expect(release).not.toContain('--generate-notes')
    expect(release).not.toMatch(/python/i)
  })
})

describe('the run instructions in the zip', () => {
  const instructions = text('scripts/release/README-run.txt')

  it('start the app with Node and never with Python', () => {
    expect(instructions).not.toMatch(/python/i)
    expect(instructions).toContain('node serve.mjs')
    expect(instructions).toContain('http://127.0.0.1:4173')
    expect(instructions).not.toContain('\u2014')
  })

  it('say which browsers open a folder', () => {
    expect(instructions).toMatch(/Chrome or Edge/)
  })
})

describe('the release checklist', () => {
  it('has the folder picker check as boxes to tick', () => {
    const checklist = text('docs/release-checklist.md')
    expect(checklist).toMatch(/folder picker/i)
    expect(checklist.match(/^- \[ \] /gm)?.length ?? 0).toBeGreaterThanOrEqual(6)
    expect(checklist).not.toContain('\u2014')
  })
})

const scratch = mkdtempSync(join(tmpdir(), 'anatomy-release-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** A build folder with a page, an asset in a folder, and a file that sits outside it. */
function fakeBuild(parent: string) {
  mkdirSync(join(parent, 'dist', 'assets'), { recursive: true })
  writeFileSync(join(parent, 'dist', 'index.html'), '<!doctype html><title>Anatomy</title>')
  writeFileSync(join(parent, 'dist', 'assets', 'app.js'), 'export {}')
  writeFileSync(join(parent, 'dist', 'assets', 'font.woff2'), 'font')
  writeFileSync(join(parent, 'secret.txt'), 'outside the build')
}

describe('scripts/package-release.ts', () => {
  const run = (dist: string, out: string) =>
    execFileSync(process.execPath, [join(root, 'scripts/package-release.ts'), '--dist', dist, '--out', out], { encoding: 'utf8', cwd: scratch, stdio: 'pipe' })

  it('puts the build, the server, and the instructions in one folder named for the version', () => {
    const base = join(scratch, 'package')
    fakeBuild(base)
    run(join(base, 'dist'), join(base, 'out'))
    const folder = join(base, 'out', `anatomy-${pkg.version}`)
    expect(existsSync(join(folder, 'dist', 'index.html'))).toBe(true)
    expect(existsSync(join(folder, 'dist', 'assets', 'app.js'))).toBe(true)
    expect(readFileSync(join(folder, 'serve.mjs'), 'utf8')).toBe(text('scripts/release/serve.mjs'))
    expect(readFileSync(join(folder, 'README-run.txt'), 'utf8')).toBe(text('scripts/release/README-run.txt'))
  })

  it('replaces an older folder, so a stale file never reaches the zip', () => {
    const base = join(scratch, 'again')
    fakeBuild(base)
    run(join(base, 'dist'), join(base, 'out'))
    writeFileSync(join(base, 'out', `anatomy-${pkg.version}`, 'dist', 'stale.js'), 'old')
    run(join(base, 'dist'), join(base, 'out'))
    expect(existsSync(join(base, 'out', `anatomy-${pkg.version}`, 'dist', 'stale.js'))).toBe(false)
  })

  it('fails with a clear message when the build is missing', () => {
    expect(() => run(join(scratch, 'nothing-here'), join(scratch, 'out2'))).toThrow(/npm run build/)
  })
})

describe('scripts/release/serve.mjs', () => {
  const base = join(scratch, 'serve')
  beforeAll(() => {
    fakeBuild(base)
    if (existsSync(join(root, 'scripts/release/serve.mjs'))) cpSync(join(root, 'scripts/release/serve.mjs'), join(base, 'serve.mjs'))
  })

  /** Starts the server the way the instructions do, on a free port, and waits for the address it prints. */
  async function start() {
    const child = spawn(process.execPath, ['serve.mjs', '0'], { cwd: base })
    let out = ''
    const url = await new Promise<string>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString()
        const found = /http:\/\/127\.0\.0\.1:\d+/.exec(out)
        if (found) resolve(found[0])
      })
      child.once('error', reject)
      child.once('exit', () => reject(new Error(`the server stopped: ${out}`)))
    })
    return { url, stop: () => void child.kill() }
  }

  it('serves the page, a script, and a font with their types, on the loopback address', async () => {
    const server = await start()
    try {
      const page = await fetch(`${server.url}/`)
      expect(page.status).toBe(200)
      expect(page.headers.get('content-type')).toContain('text/html')
      expect(await page.text()).toContain('<title>Anatomy</title>')
      expect((await fetch(`${server.url}/assets/app.js`)).headers.get('content-type')).toContain('text/javascript')
      expect((await fetch(`${server.url}/assets/font.woff2`)).headers.get('content-type')).toBe('font/woff2')
    } finally {
      server.stop()
    }
  })

  it('answers 404 for a path that a URL parser would read as another host', async () => {
    const server = await start()
    // `fetch` would rewrite these paths, so they go out raw, as a browser or a script could send them.
    const status = (path: string) =>
      new Promise<number>((resolve, reject) => {
        const { hostname, port } = new URL(server.url)
        request({ host: hostname, port, path }, (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        })
          .once('error', reject)
          .end()
      })
    try {
      for (const path of ['//evil/index.html', '/\\evil', '/%2e%2e/index.html', '/%2e%2e%2findex.html']) {
        expect(await status(path), path).toBe(404)
      }
    } finally {
      server.stop()
    }
  })

  it('answers 404 for a missing file and for a path that leaves the build folder', async () => {
    const server = await start()
    try {
      expect((await fetch(`${server.url}/nothing.js`)).status).toBe(404)
      // `fetch` would tidy a plain `..`, so these go through as encoded text.
      for (const path of ['/%2e%2e/secret.txt', '/assets/%2e%2e/%2e%2e/secret.txt', '/..%5csecret.txt', '/a%00b', '/%E0%A4%A']) {
        const response = await fetch(`${server.url}${path}`)
        expect(response.status, path).toBe(404)
        expect(await response.text(), path).not.toContain('outside the build')
      }
    } finally {
      server.stop()
    }
  })

  it('refuses a method that changes anything', async () => {
    const server = await start()
    try {
      expect((await fetch(`${server.url}/`, { method: 'POST', body: 'x' })).status).toBe(405)
    } finally {
      server.stop()
    }
  })
})
