// The `anatomy` command line tool on Node. The app bundles this file, with everything it imports, into
// `.anatomy/anatomy.mjs`. In this repository, run it with `npm run anatomy -- <command>`.
// It reads the board, the feedback.json next to it, and a patch, writes only the board and its previous version
// (fmt and apply), and imports no network module.
// Must stay first. See src/cli/jitless.ts.
import '../src/cli/jitless.ts'
import { chmodSync, closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAnatomy, type ReadResult } from '../src/cli/anatomy.ts'
import { PATCH_LIMITS } from '../src/cli/apply.ts'

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

/** What was piped in, a regular file or a pipe, read to the size of the largest patch and one byte more. */
function stdin(): ReadResult {
  try {
    const buffer = Buffer.allocUnsafe(PATCH_LIMITS.bytes + 1)
    let length = 0
    while (length < buffer.length) {
      let count: number
      try {
        count = readSync(0, buffer, length, buffer.length - length, null)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EOF') break
        throw error
      }
      if (count === 0) break
      length += count
    }
    return { ok: true, text: buffer.toString('utf8', 0, length) }
  } catch (error) {
    return { ok: false, missing: false, reason: (error as NodeJS.ErrnoException).code ?? String(error) }
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

/** True for a link, even one that points at nothing. */
function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * Writes a new temporary file next to the target and renames it over the target, so a reader never sees half a board.
 * The temporary file must not exist yet ('wx'), so it never follows a planted link. The board keeps its permissions,
 * and a read-only board is left alone.
 */
function write(path: string, text: string, create = false): void {
  const missing = create && !existsSync(path) && !isLink(path)
  const real = missing ? path : target(path)
  const info = missing ? undefined : statSync(real)
  if (info !== undefined && !info.isFile()) throw new Error(NOT_REGULAR)
  const mode = info === undefined ? 0o644 : info.mode & 0o777
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

// The bundle carries the authoring guide and the field list as text, set by scripts/lib/cliBundle.ts, so `topic` and
// `schema` need no other file. From the source, they are read from this repository.
declare const __ANATOMY_GUIDE__: string | undefined
declare const __ANATOMY_FIELDS__: string | undefined
const embeddedGuide = typeof __ANATOMY_GUIDE__ === 'string' ? __ANATOMY_GUIDE__ : undefined
const embeddedFields = typeof __ANATOMY_FIELDS__ === 'string' ? __ANATOMY_FIELDS__ : undefined
const repoText = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const result = runAnatomy(process.argv.slice(2), {
  defaultBoard: bundled ? join(here, 'board.json') : join(cwd, '.anatomy', 'board.json'),
  invocation: bundled ? `node ${display(self)}` : 'npm run anatomy --',
  read: (path) => read(resolve(cwd, path)),
  stdin,
  write: (path, text, options) => write(resolve(cwd, path), text, options?.create === true),
  sibling: (path, name) => join(dirname(resolve(cwd, path)), name),
  display: (path) => display(resolve(cwd, path)),
  guide: () => embeddedGuide ?? repoText('../docs/authoring-guide.md'),
  schemaSheet: () => embeddedFields ?? repoText('../schema/board.v1.fields.txt'),
})
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
process.exitCode = result.code
