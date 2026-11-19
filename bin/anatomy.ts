// The `anatomy` command line tool on Node. The app bundles this file, with everything it imports, into
// `.anatomy/anatomy.mjs`. In this repository, run it with `npm run anatomy -- <command>`.
// It reads only the board and the feedback.json next to it, writes only the board (fmt), and imports no network module.
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { runAnatomy, type ReadResult } from '../src/cli/anatomy.ts'

// Zod can compile a fast path with `new Function`. The tool does not need the speed, so nothing is compiled at all.
z.config({ jitless: true })

/** Larger files are not read. The board limit is 1,000,000 bytes, so this only stops a wrong path from filling memory. */
const MAX_READ_BYTES = 16_000_000

const self = fileURLToPath(import.meta.url)
const here = dirname(self)
// Bundled as .anatomy/anatomy.mjs, the board is next to the script. In this repository, it is in the current folder.
const bundled = basename(here) === '.anatomy'
const cwd = process.cwd()

function display(path: string): string {
  const shown = relative(cwd, path)
  return shown === '' || shown.startsWith('..') || isAbsolute(shown) ? path : shown
}

function read(path: string): ReadResult {
  try {
    const size = statSync(path).size
    if (size > MAX_READ_BYTES) return { ok: false, missing: false, reason: `it has ${size.toLocaleString('en-US')} bytes, too large to be a board` }
    return { ok: true, text: readFileSync(path, 'utf8') }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { ok: false, missing: true, reason: 'no such file' }
    if (code === 'EISDIR') return { ok: false, missing: false, reason: 'it is a folder' }
    return { ok: false, missing: false, reason: code ?? String(error) }
  }
}

/** Writes a temporary file next to the target and renames it, so a reader never sees half a board. */
function write(path: string, text: string): void {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
  try {
    writeFileSync(temporary, text)
    renameSync(temporary, path)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}

const result = runAnatomy(process.argv.slice(2), {
  defaultBoard: bundled ? join(here, 'board.json') : join(cwd, '.anatomy', 'board.json'),
  invocation: bundled ? `node ${display(self)}` : 'npm run anatomy --',
  read: (path) => read(resolve(cwd, path)),
  write: (path, text) => write(resolve(cwd, path), text),
  sibling: (path, name) => join(dirname(resolve(cwd, path)), name),
  display: (path) => display(resolve(cwd, path)),
})
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
process.exitCode = result.code
