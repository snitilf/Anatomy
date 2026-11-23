// Writes the files the app writes for an agent into `<folder>/.anatomy/`, the way Copy prompt does: the README, the
// topics in `guide/`, the JSON Schema, and `anatomy.mjs`. A file the user took over (no mark) stays as it is.
// It is for the evaluation in `eval/`, so a run needs no browser.
// Run with: npm run agent-files -- <folder>
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { keepScript } from '../src/cli/script.ts'
import { buildCliBundle } from './lib/cliBundle.ts'
import { withAppModules } from './lib/vite.ts'

interface AgentFile {
  name: string
  text: string
  keep: (existing: string) => boolean
}

function fail(message: string): never {
  console.error(message)
  process.exit(2)
}

/** The kind of what is at `path` without following a link, or undefined when nothing is there. */
function kind(path: string): 'file' | 'dir' | 'link' | 'other' | undefined {
  try {
    const info = lstatSync(path)
    return info.isSymbolicLink() ? 'link' : info.isFile() ? 'file' : info.isDirectory() ? 'dir' : 'other'
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

const given = process.argv[2]
if (given === undefined || kind(resolve(given)) !== 'dir') fail('Usage: npm run agent-files -- <folder>\nThe folder must exist, and must not be a link.')
const folder = realpathSync(resolve(given))

/** Stops when `path` is a link, or is not inside the folder once links above it are resolved. */
function guard(path: string, expected: 'file' | 'dir'): void {
  const found = kind(path)
  if (found === 'link') fail(`${path} is a link. Anatomy writes only real files inside ${folder}.`)
  if (found !== undefined && found !== expected) fail(`${path} is not a ${expected === 'dir' ? 'folder' : 'regular file'}.`)
  if (found === undefined) return
  const inside = relative(folder, realpathSync(path))
  if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) fail(`${path} is outside ${folder}.`)
}

const [{ agentFiles }, { filePath }] = (await withAppModules(['/src/app/agentReadme.ts', '/src/workspace/folder.ts'], (modules) => modules)) as [
  { agentFiles: () => AgentFile[] },
  { filePath: (name: string) => { dir: string | undefined; file: string } },
]
const script = (await buildCliBundle()).text
const files: AgentFile[] = [...agentFiles(), { name: 'anatomy.mjs', text: script, keep: (existing) => keepScript(existing, script) }]

const anatomy = join(folder, '.anatomy')
guard(anatomy, 'dir')
mkdirSync(anatomy, { recursive: true })
for (const file of files) {
  // The same rule as the app: only Anatomy's names, straight in .anatomy or in .anatomy/guide.
  const place = filePath(file.name)
  const dir = place.dir === undefined ? anatomy : join(anatomy, place.dir)
  guard(dir, 'dir')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, place.file)
  guard(path, 'file')
  const existing = kind(path) === 'file' ? readFileSync(path, 'utf8') : undefined
  if (existing !== undefined && file.keep(existing)) {
    console.log(`Kept ${path}`)
    continue
  }
  writeFileSync(path, file.text)
  console.log(`Wrote ${path}`)
}
