import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import exampleText from '../examples/example.board.json?raw'
import { parseBoard } from '../board/validate'
import type { Board } from '../board/schema'
import { emptyLayer, type Layer } from '../layer/model'
import { openStore, StorageError, type BoardStore } from './db'

function exampleBoard(): Board {
  const result = parseBoard(exampleText)
  if (!result.ok) throw new Error('example board is invalid')
  return result.board
}

function layerFor(boardId: string): Layer {
  return { ...emptyLayer(boardId), positions: { a: { x: 1, y: 2 } } }
}

const opened: BoardStore[] = []
async function open(factory: IDBFactory) {
  const store = await openStore(factory)
  opened.push(store)
  return store
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const store of opened.splice(0)) store.close()
})

describe('board store', () => {
  it('round-trips a board and its layer', async () => {
    const store = await open(new IDBFactory())
    const board = exampleBoard()
    await store.saveBoard(board)
    await store.saveLayer(layerFor(board.id))
    const loaded = await store.loadBoard(board.id)
    expect(loaded?.board).toEqual(board)
    expect(loaded?.layer).toEqual(layerFor(board.id))
    expect(await store.loadBoard('missing')).toBeUndefined()
  })

  it('loads a board with no layer', async () => {
    const store = await open(new IDBFactory())
    const board = exampleBoard()
    await store.saveBoard(board)
    expect((await store.loadBoard(board.id))?.layer).toBeUndefined()
  })

  it('lists boards newest first', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const store = await open(new IDBFactory())
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

  it('deletes the board and its layer together', async () => {
    const store = await open(new IDBFactory())
    const board = exampleBoard()
    await store.saveBoard(board)
    await store.saveLayer(layerFor(board.id))
    await store.deleteBoard(board.id)
    expect(await store.loadBoard(board.id)).toBeUndefined()
    expect(await store.listBoards()).toEqual([])
  })

  it('remembers what was opened last, and the folder handle', async () => {
    const factory = new IDBFactory()
    const store = await open(factory)
    expect(await store.getLastOpened()).toBeUndefined()
    await store.setLastOpened({ mode: 'file', boardId: 'abc' })
    expect(await store.getLastOpened()).toEqual({ mode: 'file', boardId: 'abc' })
    await store.setFolder({ kind: 'directory', name: 'shop' })
    store.close()
    const again = await open(factory)
    expect(await again.getLastOpened()).toEqual({ mode: 'file', boardId: 'abc' })
    await again.setLastOpened({ mode: 'folder' })
    expect(await again.getLastOpened()).toEqual({ mode: 'folder' })
    expect(await again.getFolder()).toEqual({ kind: 'directory', name: 'shop' })
    await again.setFolder(undefined)
    expect(await again.getFolder()).toBeUndefined()
  })

  it('uses one database named anatomy', async () => {
    const factory = new IDBFactory()
    await open(factory)
    expect((await factory.databases()).map((d) => d.name)).toEqual(['anatomy'])
  })

  it('reports a quota error thrown by put', async () => {
    const store = await open(new IDBFactory())
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    await expect(store.saveBoard(exampleBoard())).rejects.toMatchObject({
      name: 'StorageError',
      kind: 'quota',
    })
  })

  it('reports an aborted transaction as a failure', async () => {
    const store = await open(new IDBFactory())
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
    await expect(openStore(throwing)).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('reports a missing indexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined)
    try {
      await expect(openStore()).rejects.toMatchObject({ kind: 'unavailable' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
