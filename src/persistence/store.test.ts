import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import exampleText from '../examples/example.board.json?raw'
import { parseBoard } from '../board/validate'
import type { Board } from '../board/schema'
import type { Overlay } from '../overlay/types'
import { openStore, StorageError, type BoardStore } from './store'

function exampleBoard(): Board {
  const result = parseBoard(exampleText)
  if (!result.ok) throw new Error('example board is invalid')
  return result.board
}

function overlayFor(boardId: string): Overlay {
  return {
    format: 'anatomy-overlay',
    schemaVersion: 1,
    boardId,
    positions: { a: { x: 1, y: 2 } },
    notes: [],
    manualLinks: [],
  }
}

const opened: BoardStore[] = []
async function open(ns: 'home' | 'work', factory: IDBFactory) {
  const store = await openStore(ns, factory)
  opened.push(store)
  return store
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const store of opened.splice(0)) store.close()
})

describe('board store', () => {
  it('round-trips a board and its overlay', async () => {
    const store = await open('home', new IDBFactory())
    const board = exampleBoard()
    await store.saveBoard(board)
    await store.saveOverlay(overlayFor(board.id))
    const loaded = await store.loadBoard(board.id)
    expect(loaded?.board).toEqual(board)
    expect(loaded?.overlay).toEqual(overlayFor(board.id))
    expect(await store.loadBoard('missing')).toBeUndefined()
  })

  it('loads a board with no overlay', async () => {
    const store = await open('home', new IDBFactory())
    const board = exampleBoard()
    await store.saveBoard(board)
    expect((await store.loadBoard(board.id))?.overlay).toBeUndefined()
  })

  it('keeps home and work apart', async () => {
    const factory = new IDBFactory()
    const home = await open('home', factory)
    const work = await open('work', factory)
    const board = exampleBoard()
    await home.saveBoard(board)
    expect(await work.listBoards()).toEqual([])
    expect(await work.loadBoard(board.id)).toBeUndefined()
    expect((await home.listBoards()).map((b) => b.id)).toEqual([board.id])
  })

  it('lists boards newest first', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const store = await open('home', new IDBFactory())
      const base = exampleBoard()
      for (const [i, id] of ['one', 'two', 'three'].entries()) {
        vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i))
        await store.saveBoard({ ...base, id })
      }
      vi.setSystemTime(new Date(2026, 0, 2))
      await store.saveBoard({ ...base, id: 'one' })
      expect((await store.listBoards()).map((b) => b.id)).toEqual(['one', 'three', 'two'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('deletes the board and its overlay together', async () => {
    const store = await open('home', new IDBFactory())
    const board = exampleBoard()
    await store.saveBoard(board)
    await store.saveOverlay(overlayFor(board.id))
    await store.deleteBoard(board.id)
    expect(await store.loadBoard(board.id)).toBeUndefined()
    expect(await store.listBoards()).toEqual([])
  })

  it('remembers the last opened board', async () => {
    const factory = new IDBFactory()
    const store = await open('home', factory)
    expect(await store.getLastOpened()).toBeUndefined()
    await store.setLastOpened('abc')
    expect(await store.getLastOpened()).toBe('abc')
    store.close()
    const again = await open('home', factory)
    expect(await again.getLastOpened()).toBe('abc')
  })

  it('reports a quota error thrown by put', async () => {
    const store = await open('home', new IDBFactory())
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    await expect(store.saveBoard(exampleBoard())).rejects.toMatchObject({
      name: 'StorageError',
      kind: 'quota',
    })
  })

  it('reports an aborted transaction as a failure', async () => {
    const store = await open('home', new IDBFactory())
    const realPut = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = realPut.apply(this, args)
      queueMicrotask(() => {
        try {
          this.transaction.abort()
        } catch {
          // already finished
        }
      })
      return request
    })
    const error = await store.saveBoard(exampleBoard()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(StorageError)
    expect((error as StorageError).kind).toBe('failed')
  })

  it('reports unavailable storage', async () => {
    const throwing = {
      open() {
        throw new DOMException('denied', 'SecurityError')
      },
    } as unknown as IDBFactory
    await expect(openStore('home', throwing)).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('reports a missing indexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined)
    try {
      await expect(openStore('home')).rejects.toMatchObject({ kind: 'unavailable' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
