import type { Board } from '../board/schema'
import { parseBoard, type BoardProblem } from '../board/validate'
import { FILES, type FileStamp, type Folder } from './folder'

/**
 * Notices new revisions of `.anatomy/board.json` while an agent writes them.
 * A file is read only once it has stayed the same for two checks in a row, so a file caught halfway through a write
 * is never parsed. Problems are never shown: a broken file is simply skipped until it changes again.
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

export interface WatchOptions {
  /** The file as it was when the board was opened. */
  seen: FileStamp | undefined
  /** The revision open now. 0 when no board is open. */
  revision: () => number
  /** A valid board with a higher revision. */
  onBoard: (board: Board, warnings: BoardProblem[]) => void
  knownLessons?: readonly string[]
  intervalMs?: number
}

/** Checks the folder every two seconds while the page is visible, and when the window gains focus. Returns a stop function. */
export function watchBoard(folder: Folder, options: WatchOptions): () => void {
  let state: WatchState = options.seen ? { seen: options.seen } : {}
  let stopped = false
  let busy = false

  const tick = async () => {
    if (stopped || busy || document.visibilityState === 'hidden') return
    busy = true
    try {
      const step = observe(state, await folder.stat(FILES.board))
      state = step.state
      if (!step.read || stopped) return
      const file = await folder.read(FILES.board)
      if (!file || stopped) return
      state = { seen: file.stamp }
      const parsed = parseBoard(file.text, options.knownLessons ? { knownLessons: options.knownLessons } : {})
      if (parsed.ok && parsed.board.revision > options.revision()) options.onBoard(parsed.board, parsed.warnings)
    } catch {
      // A folder that cannot be read right now is checked again on the next tick.
    } finally {
      busy = false
    }
  }

  const timer = window.setInterval(() => void tick(), options.intervalMs ?? POLL_MS)
  const onFocus = () => void tick()
  const onVisible = () => {
    if (document.visibilityState === 'visible') void tick()
  }
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    stopped = true
    window.clearInterval(timer)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
