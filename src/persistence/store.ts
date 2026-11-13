import type { Board } from '../board/schema'
import type { Overlay } from '../overlay/types'

export type Namespace = 'home' | 'work'

export const NAMESPACES: Record<Namespace, string> = { home: 'Home', work: 'Work' }

export interface SavedBoard {
  board: Board
  savedAt: string
}

export interface BoardSummary {
  id: string
  title: string
  revision: number
  savedAt: string
}

export type StorageErrorKind = 'unavailable' | 'quota' | 'blocked' | 'failed'

export class StorageError extends Error {
  readonly kind: StorageErrorKind

  constructor(kind: StorageErrorKind, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'StorageError'
    this.kind = kind
  }
}

const DB_VERSION = 1
const BOARDS = 'boards'
const OVERLAYS = 'overlays'
const META = 'meta'
const LAST_OPENED = 'lastOpened'

export interface BoardStore {
  readonly namespace: Namespace
  /** Newest save first. */
  listBoards(): Promise<BoardSummary[]>
  /**
   * Returns the stored objects exactly as they were read.
   * Stored data is untrusted: the user or another tab may have edited it,
   * and an older version of the app may have written it.
   * The caller must validate both values before using them.
   */
  loadBoard(id: string): Promise<{ board: Board; overlay: Overlay | undefined } | undefined>
  saveBoard(board: Board): Promise<void>
  saveOverlay(overlay: Overlay): Promise<void>
  /** Removes the board and its overlay in one transaction. */
  deleteBoard(id: string): Promise<void>
  getLastOpened(): Promise<string | undefined>
  setLastOpened(id: string): Promise<void>
  close(): void
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''
}

function toStorageError(error: unknown, fallback: string): StorageError {
  if (error instanceof StorageError) return error
  const name = errorName(error)
  if (name === 'QuotaExceededError') {
    return new StorageError('quota', 'The browser has no storage space left for this board.', { cause: error })
  }
  if (name === 'SecurityError' || name === 'InvalidAccessError') {
    return new StorageError('unavailable', 'This browser does not allow local storage here.', { cause: error })
  }
  return new StorageError('failed', fallback, { cause: error })
}

function unavailable(cause?: unknown): StorageError {
  return new StorageError('unavailable', 'This browser does not allow local storage here.', {
    cause,
  })
}

export async function openStore(
  ns: Namespace,
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
): Promise<BoardStore> {
  if (!factory) throw unavailable()
  const db = await openDatabase(`anatomy-${ns}`, factory)
  return createStore(ns, db)
}

function openDatabase(name: string, factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = factory.open(name, DB_VERSION)
    } catch (error) {
      reject(toStorageError(error, 'Could not open local storage.'))
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      for (const store of [BOARDS, OVERLAYS, META]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store)
      }
    }
    request.onblocked = () => {
      reject(
        new StorageError('blocked', 'Local storage is in use by another tab. Close other Anatomy tabs and try again.'),
      )
    }
    request.onerror = () => {
      reject(toStorageError(request.error, 'Could not open local storage.'))
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}

/**
 * Runs `work` in one transaction and resolves with its result
 * only when the transaction has committed.
 */
function transact<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => IDBRequest | IDBRequest[] | undefined,
  read: (requests: IDBRequest[]) => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction
    let requests: IDBRequest[] = []
    try {
      tx = db.transaction(stores, mode)
    } catch (error) {
      reject(toStorageError(error, 'Local storage is not available.'))
      return
    }
    let failure: unknown
    tx.oncomplete = () => {
      try {
        resolve(read(requests))
      } catch (error) {
        reject(toStorageError(error, 'Could not read from local storage.'))
      }
    }
    tx.onerror = () => {
      failure ??= tx.error
    }
    tx.onabort = () => {
      reject(toStorageError(tx.error ?? failure, 'Could not write to local storage.'))
    }
    try {
      const result = work(tx)
      requests = result === undefined ? [] : Array.isArray(result) ? result : [result]
    } catch (error) {
      failure = error
      try {
        tx.abort()
      } catch {
        // The transaction already finished.
      }
      reject(toStorageError(error, 'Could not write to local storage.'))
    }
  })
}

function createStore(namespace: Namespace, db: IDBDatabase): BoardStore {
  return {
    namespace,

    listBoards() {
      return transact(
        db,
        [BOARDS],
        'readonly',
        (tx) => tx.objectStore(BOARDS).getAll(),
        ([request]) => {
          const rows = (request?.result ?? []) as SavedBoard[]
          const summaries: BoardSummary[] = []
          for (const row of rows) {
            const board = row?.board as Partial<Board> | undefined
            if (!board || typeof board.id !== 'string') continue
            summaries.push({
              id: board.id,
              title: typeof board.title === 'string' ? board.title : board.id,
              revision: typeof board.revision === 'number' ? board.revision : 0,
              savedAt: typeof row.savedAt === 'string' ? row.savedAt : '',
            })
          }
          return summaries.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0))
        },
      )
    },

    loadBoard(id) {
      return transact(
        db,
        [BOARDS, OVERLAYS],
        'readonly',
        (tx) => [tx.objectStore(BOARDS).get(id), tx.objectStore(OVERLAYS).get(id)],
        ([boardRequest, overlayRequest]) => {
          const saved = boardRequest?.result as SavedBoard | undefined
          if (saved === undefined) return undefined
          return {
            board: saved.board,
            overlay: overlayRequest?.result as Overlay | undefined,
          }
        },
      )
    },

    saveBoard(board) {
      const row: SavedBoard = { board, savedAt: new Date().toISOString() }
      return transact(db, [BOARDS], 'readwrite', (tx) => tx.objectStore(BOARDS).put(row, board.id), () => undefined)
    },

    saveOverlay(overlay) {
      return transact(
        db,
        [OVERLAYS],
        'readwrite',
        (tx) => tx.objectStore(OVERLAYS).put(overlay, overlay.boardId),
        () => undefined,
      )
    },

    deleteBoard(id) {
      return transact(
        db,
        [BOARDS, OVERLAYS],
        'readwrite',
        (tx) => [tx.objectStore(BOARDS).delete(id), tx.objectStore(OVERLAYS).delete(id)],
        () => undefined,
      )
    },

    getLastOpened() {
      return transact(
        db,
        [META],
        'readonly',
        (tx) => tx.objectStore(META).get(LAST_OPENED),
        ([request]) => {
          const value: unknown = request?.result
          return typeof value === 'string' ? value : undefined
        },
      )
    },

    setLastOpened(id) {
      return transact(db, [META], 'readwrite', (tx) => tx.objectStore(META).put(id, LAST_OPENED), () => undefined)
    },

    close() {
      db.close()
    },
  }
}
