import { createContext, useContext } from 'react'
import type { Board } from '../board/schema'
import type { Overlay } from '../overlay/types'
import type { BoardSummary, Namespace, StorageError } from '../persistence/store'
import type { Action } from './state'

/** What the toolbar says about saving. It says "saved" only after the browser confirmed the write. */
export type SaveState =
  | { kind: 'none' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; error: StorageError }

/** A file that carries its own notes, opened while this browser already has notes for the board. */
export interface FileChoice {
  title: string
  file: Extract<Action, { type: 'boardOpened' }>
  existing: { board: Board; overlay: Overlay }
}

export interface PersistenceApi {
  space: Namespace
  /** True while the first connection to browser storage is still being made. */
  starting: boolean
  /** Set when browser storage cannot be used at all. The app still works in memory. */
  unavailable: StorageError | undefined
  save: SaveState
  saved: readonly BoardSummary[]
  /** True for a few seconds after an export. */
  exported: boolean
  deleting: BoardSummary | undefined
  choice: FileChoice | undefined
  switchSpace: (space: Namespace) => void
  openText: (fileName: string, text: string) => void
  openSaved: (id: string) => void
  askDelete: (board: BoardSummary | undefined) => void
  confirmDelete: () => void
  resolveChoice: (use: 'file' | 'browser' | undefined) => void
  exportNow: () => void
  retrySave: () => void
}

export const PersistenceContext = createContext<PersistenceApi>({
  space: 'home',
  starting: false,
  unavailable: undefined,
  save: { kind: 'none' },
  saved: [],
  exported: false,
  deleting: undefined,
  choice: undefined,
  switchSpace: () => {},
  openText: () => {},
  openSaved: () => {},
  askDelete: () => {},
  confirmDelete: () => {},
  resolveChoice: () => {},
  exportNow: () => {},
  retrySave: () => {},
})

export function usePersistence(): PersistenceApi {
  return useContext(PersistenceContext)
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
      return 'The browser could not write the data'
  }
}
