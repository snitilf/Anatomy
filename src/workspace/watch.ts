import type { Board } from '../board/schema'
import { parseBoard, type BoardProblem } from '../board/validate'
import { FILES, FileTooLargeError, type FileStamp, type Folder } from './folder'

/**
 * Notices new revisions of `.anatomy/board.json` while an agent writes them.
 * A file is read only once it has stayed the same for two checks in a row, so a file caught halfway through a write
 * is never parsed. A file that stayed the same and still cannot be opened is reported once through `onProblem`, and the
 * board that is open stays as it was.
 */

export interface WatchState {
  /** The file as it was when it was last read, or when the board was opened. */
  seen?: FileStamp
  /** A changed file, waiting for the next check to show it has stopped changing. */
  pending?: FileStamp
}

const same = (a: FileStamp | undefined, b: FileStamp | undefined) => a !== undefined && b !== undefined && a.lastModified === b.lastModified && a.size === b.size

/** One check. `read` is true when the file changed and then stayed the same since the last check. */
export function observe(state: WatchState, stamp: FileStamp | undefined): { state: WatchState; read: boolean } {
  if (stamp === undefined || same(stamp, state.seen)) return { state: state.seen ? { seen: state.seen } : {}, read: false }
  if (same(stamp, state.pending)) return { state, read: true }
  return { state: { ...(state.seen ? { seen: state.seen } : {}), pending: stamp }, read: false }
}

const POLL_MS = 2000
/** While the page is hidden the folder is checked this often, so a revision that arrives in the background is still found. */
const HIDDEN_POLL_MS = 10_000

/** Why a file the agent wrote was not opened. */
export type WatchProblem =
  /** It is not a valid board, or it is too large to read. */
  | { kind: 'invalid'; errors: BoardProblem[] }
  /** It is a valid board, but its revision is not higher than the one open. */
  | { kind: 'not-rising'; board: Board }

export interface WatchOptions {
  /** The file as it was when the board was opened. */
  seen: FileStamp | undefined
  /** The revision open now. 0 when no board is open. */
  revision: () => number
  /** A valid board with a higher revision. */
  onBoard: (board: Board, warnings: BoardProblem[]) => void
  /** A file that was read and not opened. Called once for each change of the file. */
  onProblem?: (problem: WatchProblem) => void
  knownLessons?: readonly string[]
  intervalMs?: number
  hiddenIntervalMs?: number
}

/**
 * Checks the folder every two seconds while the page is visible, every ten while it is hidden, and at once when the window
 * gains focus or the page becomes visible. Returns a stop function.
 */
export function watchBoard(folder: Folder, options: WatchOptions): () => void {
  let state: WatchState = options.seen ? { seen: options.seen } : {}
  let stopped = false
  let busy = false
  let timer: number | undefined

  const tick = async () => {
    if (stopped || busy) return
    busy = true
    try {
      const step = observe(state, await folder.stat(FILES.board))
      state = step.state
      if (!step.read || stopped) return
      let file
      try {
        file = await folder.read(FILES.board)
      } catch (error) {
        // A board over the size limit is never read. It counts as seen, so it is looked at again only when it changes.
        if (error instanceof FileTooLargeError) {
          if (step.state.pending) state = { seen: step.state.pending }
          options.onProblem?.({ kind: 'invalid', errors: [{ path: '', message: error.message }] })
        }
        throw error
      }
      if (!file || stopped) return
      state = { seen: file.stamp }
      const parsed = parseBoard(file.text, options.knownLessons ? { knownLessons: options.knownLessons } : {})
      if (!parsed.ok) options.onProblem?.({ kind: 'invalid', errors: parsed.errors })
      else if (parsed.board.revision > options.revision()) options.onBoard(parsed.board, parsed.warnings)
      else options.onProblem?.({ kind: 'not-rising', board: parsed.board })
    } catch {
      // A folder that cannot be read right now is checked again on the next tick.
    } finally {
      busy = false
    }
  }

  const schedule = () => {
    window.clearTimeout(timer)
    if (stopped) return
    const hidden = document.visibilityState === 'hidden'
    timer = window.setTimeout(() => void tick().then(schedule), hidden ? (options.hiddenIntervalMs ?? HIDDEN_POLL_MS) : (options.intervalMs ?? POLL_MS))
  }
  const now = () => {
    void tick().then(schedule)
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') now()
    else schedule()
  }
  schedule()
  window.addEventListener('focus', now)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    stopped = true
    window.clearTimeout(timer)
    window.removeEventListener('focus', now)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
