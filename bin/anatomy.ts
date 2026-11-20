// The `anatomy` command line tool on Node. The app bundles this file, with everything it imports, into
// `.anatomy/anatomy.mjs`. In this repository, run it with `npm run anatomy -- <command>`.
// It reads only the board and the feedback.json next to it, writes only the board (fmt), and imports no network module.
// Must stay first. See src/cli/jitless.ts.
import '../src/cli/jitless.ts'
import { chmodSync, closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAnatomy, type ReadResult } from '../src/cli/anatomy.ts'

/** Larger files are not read. The board limit is 1,000,000 bytes, so this only stops a wrong path from filling memory. */
const MAX_READ_BYTES = 16_000_000

const self = fileURLToPath(import.meta.url)
const here = dirname(self)
// Bundled as .anatomy/anatomy.mjs, the board is next to the script. In this repository, it is in the current folder.
const bundled = basename(here) === '.anatomy'
const cwd = process.cwd()

function display(path: string): string {
  const shown = relative(cwd, path)
  return shown === '' || shown === '..' || shown.startsWith(`..${sep}`) || isAbsolute(shown) ? path : shown
}

const NOT_REGULAR = 'it is not a regular file'

/**
 * Reads a regular file and nothing else: a device, a pipe, or a socket could never end or never answer.
 * The read stops after MAX_READ_BYTES + 1 bytes, so the cap holds even when the file grows while it is read.
 */
function read(path: string): ReadResult {
  let fd: number | undefined
  try {
    const info = statSync(path)
    if (info.isDirectory()) return { ok: false, missing: false, reason: 'it is a folder' }
    if (!info.isFile()) return { ok: false, missing: false, reason: NOT_REGULAR }
    // Non-blocking, so a file swapped for a pipe after the check above cannot hang the open.
    fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0))
    if (!fstatSync(fd).isFile()) return { ok: false, missing: false, reason: NOT_REGULAR }
    const buffer = Buffer.allocUnsafe(MAX_READ_BYTES + 1)
    let length = 0
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, null)
      if (count === 0) break
      length += count
    }
    if (length > MAX_READ_BYTES) return { ok: false, missing: false, reason: `it has more than ${MAX_READ_BYTES.toLocaleString('en-US')} bytes, too large to be a board` }
    return { ok: true, text: buffer.toString('utf8', 0, length) }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { ok: false, missing: true, reason: 'no such file' }
    if (code === 'EISDIR') return { ok: false, missing: false, reason: 'it is a folder' }
    return { ok: false, missing: false, reason: code ?? String(error) }
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/**
 * The file to replace. A link is followed only to a file in the same folder or below it, so fmt never writes outside
 * the board's folder. Writing through the link keeps the link.
 */
function target(path: string): string {
  if (!lstatSync(path).isSymbolicLink()) return path
  const real = realpathSync(path)
  const inside = relative(realpathSync(dirname(path)), real)
  // A name like "..e.json" is inside: only ".." as a whole first segment leaves the folder.
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error('it is a link to a file outside its folder')
  return real
}

/**
 * Writes a new temporary file next to the target and renames it over the target, so a reader never sees half a board.
 * The temporary file must not exist yet ('wx'), so it never follows a planted link. The board keeps its permissions,
 * and a read-only board is left alone.
 */
function write(path: string, text: string): void {
  const real = target(path)
  const info = statSync(real)
  if (!info.isFile()) throw new Error(NOT_REGULAR)
  const mode = info.mode & 0o777
  if ((mode & 0o200) === 0) throw new Error('it is read-only')
  const temporary = join(dirname(real), `.${basename(real)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`)
  let created = false
  try {
    writeFileSync(temporary, text, { flag: 'wx', mode })
    created = true
    chmodSync(temporary, mode)
    renameSync(temporary, real)
  } catch (error) {
    if (created) rmSync(temporary, { force: true })
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
