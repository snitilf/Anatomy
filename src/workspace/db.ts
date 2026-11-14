import type { Board } from '../board/schema'
import type { Layer } from '../layer/model'

/** The one browser database. Databases of earlier versions ("anatomy-home", "anatomy-work") are left as they are. */
export const DB_NAME = 'anatomy'

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

export type StorageErrorKind = 'unavailable' | 'quota' | 'blocked' | 'failed' | 'folder'

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
const LAYERS = 'layers'
const META = 'meta'
const LAST_OPENED = 'lastOpened'
const FOLDER = 'folder'

/** What to open again after a reload: a board saved in this browser, or the repository folder. */
export type LastOpened = { mode: 'file'; boardId: string } | { mode: 'folder' }

export interface BoardStore {
  /** Newest save first. */
  listBoards(): Promise<BoardSummary[]>
  /**
   * Returns the stored objects exactly as they were read.
   * Stored data is untrusted: the user or another tab may have edited it,
   * and an older version of the app may have written it.
   * The caller must validate both values before using them.
   */
  loadBoard(id: string): Promise<{ board: unknown; layer: unknown } | undefined>
  saveBoard(board: Board): Promise<void>
  saveLayer(layer: Layer): Promise<void>
  /** Removes the board and its layer in one transaction. */
  deleteBoard(id: string): Promise<void>
  getLastOpened(): Promise<LastOpened | undefined>
  setLastOpened(last: LastOpened): Promise<void>
  /** The stored handle of the repository folder. Untrusted: the caller checks what it is. */
  getFolder(): Promise<unknown>
  setFolder(handle: unknown): Promise<void>
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

export async function openStore(factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB): Promise<BoardStore> {
  if (!factory) throw unavailable()
  const db = await openDatabase(DB_NAME, factory)
  return createStore(db)
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
      for (const store of [BOARDS, LAYERS, META]) {
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

function createStore(db: IDBDatabase): BoardStore {
  const getMeta = (key: string) => transact(db, [META], 'readonly', (tx) => tx.objectStore(META).get(key), ([request]): unknown => request?.result)
  const setMeta = (key: string, value: unknown) =>
    transact(db, [META], 'readwrite', (tx) => (value === undefined ? tx.objectStore(META).delete(key) : tx.objectStore(META).put(value, key)), () => undefined)
  return {

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
        [BOARDS, LAYERS],
        'readonly',
        (tx) => [tx.objectStore(BOARDS).get(id), tx.objectStore(LAYERS).get(id)],
        ([boardRequest, layerRequest]) => {
          const saved = boardRequest?.result as Partial<SavedBoard> | undefined
          if (saved === undefined) return undefined
          return { board: saved.board, layer: layerRequest?.result as unknown }
        },
      )
    },

    saveBoard(board) {
      const row: SavedBoard = { board, savedAt: new Date().toISOString() }
      return transact(db, [BOARDS], 'readwrite', (tx) => tx.objectStore(BOARDS).put(row, board.id), () => undefined)
    },

    saveLayer(layer) {
      return transact(db, [LAYERS], 'readwrite', (tx) => tx.objectStore(LAYERS).put(layer, layer.boardId), () => undefined)
    },

    deleteBoard(id) {
      return transact(
        db,
        [BOARDS, LAYERS],
        'readwrite',
        (tx) => [tx.objectStore(BOARDS).delete(id), tx.objectStore(LAYERS).delete(id)],
        () => undefined,
      )
    },

    async getLastOpened() {
      const value = (await getMeta(LAST_OPENED)) as Partial<Record<string, unknown>> | undefined
      if (value?.mode === 'folder') return { mode: 'folder' }
      if (value?.mode === 'file' && typeof value.boardId === 'string') return { mode: 'file', boardId: value.boardId }
      return undefined
    },

    setLastOpened(last) {
      return setMeta(LAST_OPENED, last)
    },

    getFolder() {
      return getMeta(FOLDER)
    },

    setFolder(handle) {
      return setMeta(FOLDER, handle)
    },

    close() {
      db.close()
    },
  }
}
