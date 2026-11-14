import { createContext, useContext } from 'react'
import type { Board } from '../board/schema'
import type { Layer } from '../layer/model'
import type { BoardSummary, StorageError } from '../workspace/db'
import type { FileName } from '../workspace/folder'
import type { Action } from './state'

/** What the toolbar says about saving. It says "saved" only after the write was confirmed. */
export type SaveState =
  | { kind: 'none' }
  | { kind: 'saving' }
  | { kind: 'saved'; where: 'folder' | 'browser' }
  | { kind: 'error'; error: StorageError }

/** A file that carries its own notes, opened while this browser already has notes for the board. */
export interface FileChoice {
  title: string
  file: Extract<Action, { type: 'boardOpened' }>
  existing: { board: Board; layer: Layer }
}

/**
 * The repository folder. `open`: the app reads the board from it and saves the layer into it.
 * `missing`: it is open, but has no `.anatomy/board.json` yet. `reopen`: it was open last time and needs a click to allow access again.
 */
export interface FolderStatus {
  name: string
  state: 'open' | 'missing' | 'reopen'
}

export interface WorkspaceApi {
  folder: FolderStatus | undefined
  /** True when this browser can open a repository folder. */
  canOpenFolder: boolean
  /** True while the first connection to browser storage is still being made. */
  starting: boolean
  /** Set when browser storage cannot be used at all. The app still works in memory. */
  unavailable: StorageError | undefined
  save: SaveState
  saved: readonly BoardSummary[]
  deleting: BoardSummary | undefined
  choice: FileChoice | undefined
  openFolder: () => void
  reopenFolder: () => void
  /** Writes a file into the open folder's `.anatomy` folder. False when no folder is open or the write failed. */
  writeFolderFile: (file: Extract<FileName, 'feedback.json' | 'README.md'>, text: string) => Promise<boolean>
  openText: (fileName: string, text: string) => void
  openSaved: (id: string) => void
  askDelete: (board: BoardSummary | undefined) => void
  confirmDelete: () => void
  resolveChoice: (use: 'file' | 'browser' | undefined) => void
  exportNow: () => void
  retrySave: () => void
}

const nothing = () => {}

export const WorkspaceContext = createContext<WorkspaceApi>({
  folder: undefined,
  canOpenFolder: false,
  starting: false,
  unavailable: undefined,
  save: { kind: 'none' },
  saved: [],
  deleting: undefined,
  choice: undefined,
  openFolder: nothing,
  reopenFolder: nothing,
  writeFolderFile: async () => false,
  openText: nothing,
  openSaved: nothing,
  askDelete: nothing,
  confirmDelete: nothing,
  resolveChoice: nothing,
  exportNow: nothing,
  retrySave: nothing,
})

export function useWorkspace(): WorkspaceApi {
  return useContext(WorkspaceContext)
}

/** The reason a save failed, in plain words. */
export function storageProblem(error: StorageError): string {
  switch (error.kind) {
    case 'quota':
      return 'This browser is out of storage space'
    case 'unavailable':
      return 'This browser blocks storage here'
    case 'blocked':
      return 'Another tab is holding this storage'
    case 'failed':
      return 'The browser could not save'
    case 'folder':
      return 'Anatomy could not write to the folder'
  }
}
