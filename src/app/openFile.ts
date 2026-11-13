import { parseBoard } from '../board/validate'
import { LESSON_IDS } from '../lessons/catalog'
import { parseOpenedFile } from '../overlay/exportFile'
import type { Action } from './state'

/** Turns the text of a file into the action that opens it, or the action that reports why it could not open. */
export function openFromText(fileName: string, text: string): Action {
  const opened = parseOpenedFile(text)
  if (!opened.ok) return { type: 'openFailed', fileName, errors: opened.errors }
  // The file parser does not know which lessons this app has. Re-run the board check that does.
  const checked = parseBoard(JSON.stringify(opened.board), { knownLessons: LESSON_IDS })
  const warnings = checked.ok ? checked.warnings : opened.warnings
  return opened.kind === 'export'
    ? { type: 'boardOpened', board: opened.board, overlay: opened.overlay, warnings }
    : { type: 'boardOpened', board: opened.board, warnings }
}

export async function openFromFile(file: File): Promise<Action> {
  try {
    return openFromText(file.name, await file.text())
  } catch {
    return { type: 'openFailed', fileName: file.name, errors: [{ path: '', message: 'The file could not be read.' }] }
  }
}
