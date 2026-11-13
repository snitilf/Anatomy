import { toast } from 'sonner'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Board } from '../board/schema'
import { parseBoard, type BoardProblem } from '../board/validate'
import { LESSON_IDS } from '../lessons/catalog'
import { makeExport, serializeExport } from '../overlay/exportFile'
import { overlaySchema } from '../overlay/schema'
import { emptyOverlay, type Overlay } from '../overlay/types'
import { createSaveQueue, type SaveQueue, type SaveStatus } from '../persistence/saveQueue'
import {
  openStore,
  StorageError,
  type BoardStore,
  type BoardSummary,
  type Namespace,
} from '../persistence/store'
import { hasHumanWork } from './humanWork'
import { openFromText } from './openFile'
import { PersistenceContext, type FileChoice, type PersistenceApi, type SaveState } from './persistenceContext'
import { useAppDispatch, useAppStore, useAppStoreApi } from './store'

const SPACE_KEY = 'anatomy.namespace'

function readSpace(): Namespace {
  try {
    const value = localStorage.getItem(SPACE_KEY)
    return value === 'work' ? 'work' : 'home'
  } catch {
    return 'home'
  }
}

function writeSpace(space: Namespace) {
  try {
    localStorage.setItem(SPACE_KEY, space)
  } catch {
    // The choice then lasts until the tab closes.
  }
}

interface Job {
  board: Board
  overlay: Overlay
}

type Stored =
  | { ok: true; board: Board; overlay: Overlay | undefined; warnings: BoardProblem[]; overlayProblem: boolean }
  | { ok: false }

/** Stored data is untrusted. It is checked here before the app uses any of it. */
function checkStored(raw: { board: unknown; overlay: unknown } | undefined): Stored {
  if (!raw) return { ok: false }
  const parsed = parseBoard(JSON.stringify(raw.board), { knownLessons: LESSON_IDS })
  if (!parsed.ok) return { ok: false }
  let overlay: Overlay | undefined
  let overlayProblem = false
  if (raw.overlay !== undefined) {
    const result = overlaySchema.safeParse(raw.overlay)
    if (result.success && result.data.boardId === parsed.board.id) overlay = result.data
    else overlayProblem = true
  }
  return { ok: true, board: parsed.board, overlay, warnings: parsed.warnings, overlayProblem }
}

function stamp(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
}

function asStorageError(error: unknown): StorageError {
  return error instanceof StorageError ? error : new StorageError('failed', 'Could not use browser storage.', { cause: error })
}

/**
 * Connects the app state to browser storage: restores the last board, saves every change after a short pause,
 * switches between the Home and Work spaces, and decides what happens when a file meets saved work.
 * The reducer stays pure. Everything that waits on the browser lives here.
 */
export function PersistenceProvider({ children }: { children: ReactNode }) {
  const appStore = useAppStoreApi()
  const dispatch = useAppDispatch()
  const board = useAppStore((s) => s.board)
  const overlay = useAppStore((s) => s.overlay)
  const [space, setSpace] = useState<Namespace>(readSpace)
  const [phase, setPhase] = useState<'starting' | 'ready' | 'unavailable'>('starting')
  const [unavailable, setUnavailable] = useState<StorageError | undefined>()
  const [saved, setSaved] = useState<readonly BoardSummary[]>([])
  const [queueStatus, setQueueStatus] = useState<SaveStatus>('idle')
  const [persisted, setPersisted] = useState<{ board: Board; json: string } | undefined>()
  const [deleting, setDeleting] = useState<BoardSummary | undefined>()
  const [choice, setChoice] = useState<FileChoice | undefined>()

  const generation = useRef(0)
  const storeRef = useRef<BoardStore | undefined>(undefined)
  const queueRef = useRef<SaveQueue<Job> | undefined>(undefined)
  const persistedRef = useRef<{ board: Board; json: string } | undefined>(undefined)
  const savedRef = useRef<readonly BoardSummary[]>(saved)
  const spaceRef = useRef(space)
  const statusRef = useRef<SaveStatus>('idle')
  const switchWarned = useRef(false)

  useEffect(() => {
    savedRef.current = saved
    spaceRef.current = space
  })

  const overlayJson = useMemo(() => (overlay ? JSON.stringify(overlay) : ''), [overlay])

  const notice = useCallback((message: string) => dispatch({ type: 'noticeShown', message }), [dispatch])

  const refreshList = useCallback(async (store: BoardStore, gen: number) => {
    try {
      const list = await store.listBoards()
      if (gen === generation.current) setSaved(list)
    } catch {
      // The list is a convenience. A failed read keeps the old one.
    }
  }, [])

  /** Opens a board from this space's storage. */
  const openStored = useCallback(
    async (id: string, options: { quiet?: boolean } = {}) => {
      const store = storeRef.current
      if (!store) return
      const gen = generation.current
      let raw
      try {
        raw = await store.loadBoard(id)
      } catch (error) {
        if (gen === generation.current && !options.quiet) notice(`That board could not be read from this browser. ${asStorageError(error).message}`)
        return
      }
      if (gen !== generation.current) return
      const stored = checkStored(raw)
      if (!stored.ok) {
        if (raw !== undefined || !options.quiet) {
          notice(`The board "${id}" saved in this browser could not be read, so it was not opened. Open its file again to replace it.`)
        }
        return
      }
      if (stored.overlayProblem) {
        notice(`The notes saved in this browser for "${stored.board.title}" could not be read, so the board was not opened. Open its file again to replace them.`)
        return
      }
      const overlay = stored.overlay ?? emptyOverlay(stored.board.id)
      // The stored board is already saved. Only the choice of "last opened" is new.
      persistedRef.current = { board: stored.board, json: JSON.stringify(overlay) }
      setPersisted(persistedRef.current)
      void store.setLastOpened(stored.board.id).catch(() => {})
      dispatch({ type: 'boardOpened', board: stored.board, overlay, warnings: stored.warnings })
    },
    [dispatch, notice],
  )

  const activate = useCallback(
    async (ns: Namespace, restore: boolean) => {
      const gen = ++generation.current
      const old = storeRef.current
      storeRef.current = undefined
      queueRef.current = undefined
      old?.close()
      persistedRef.current = undefined
      setPersisted(undefined)
      setQueueStatus('idle')
      setSaved([])
      setUnavailable(undefined)
      setPhase('starting')

      let store: BoardStore
      try {
        store = await openStore(ns)
      } catch (error) {
        if (gen !== generation.current) return
        setUnavailable(asStorageError(error))
        setPhase('unavailable')
        return
      }
      if (gen !== generation.current) {
        store.close()
        return
      }
      storeRef.current = store
      const queue = createSaveQueue<Job>(async (job) => {
        if (persistedRef.current?.board !== job.board) {
          await store.saveBoard(job.board)
          await store.setLastOpened(job.board.id)
        }
        await store.saveOverlay(job.overlay)
        // The browser has confirmed the write. Only now does the toolbar say "saved".
        persistedRef.current = { board: job.board, json: JSON.stringify(job.overlay) }
        if (gen === generation.current) {
          setPersisted(persistedRef.current)
          void refreshList(store, gen)
        }
      })
      queue.onStatus((status) => {
        if (queueRef.current !== queue) return
        statusRef.current = status
        setQueueStatus(status)
      })
      queueRef.current = queue
      setPhase('ready')

      await refreshList(store, gen)
      if (!restore || gen !== generation.current) return
      let last: string | undefined
      try {
        last = await store.getLastOpened()
      } catch {
        return
      }
      // A board the user opened while storage was starting wins over the last one.
      if (last !== undefined && gen === generation.current && appStore.getState().board === undefined) {
        await openStored(last, { quiet: true })
      }
    },
    [appStore, openStored, refreshList],
  )

  // Connect once. A second run (React strict mode) closes the first connection and opens its own.
  const shutdown = useCallback(() => {
    generation.current++
    void queueRef.current?.flush()
    storeRef.current?.close()
    storeRef.current = undefined
    queueRef.current = undefined
  }, [])

  useEffect(() => {
    void activate(spaceRef.current, true)
    return shutdown
  }, [activate, shutdown])

  // Save after every change to the board or the overlay.
  useEffect(() => {
    const queue = queueRef.current
    if (!board || !overlay || !queue || phase !== 'ready') return
    const done = persistedRef.current
    if (done?.board === board && done.json === overlayJson) return
    const job = () => appStore.getState()
    if (done?.board !== board) {
      // A new board or a new version: write it now, after any older board's changes are written.
      void queue.flush().then(() => {
        const s = job()
        if (s.board && s.overlay && queueRef.current === queue) {
          queue.schedule({ board: s.board, overlay: s.overlay })
          void queue.flush()
        }
      })
    } else {
      queue.schedule({ board, overlay })
    }
  }, [appStore, board, overlay, overlayJson, phase])

  // Write what is waiting when the page is hidden or closed.
  useEffect(() => {
    const flush = () => void queueRef.current?.flush()
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  const switchSpace = useCallback(
    (next: Namespace) => {
      if (next === spaceRef.current) return
      const queue = queueRef.current
      void (async () => {
        await queue?.flush()
        // Switching drops what is in memory. If the last save failed, say so once before it happens.
        if (typeof statusRef.current === 'object' && appStore.getState().board && !switchWarned.current) {
          switchWarned.current = true
          notice('This board is not saved in this browser. Export it first, or switch again to leave it behind.')
          return
        }
        switchWarned.current = false
        statusRef.current = 'idle'
        writeSpace(next)
        setSpace(next)
        spaceRef.current = next
        setChoice(undefined)
        setDeleting(undefined)
        dispatch({ type: 'closed' })
        await activate(next, true)
      })()
    },
    [activate, appStore, dispatch, notice],
  )

  const finishOpen = useCallback(
    (file: Extract<ReturnType<typeof openFromText>, { type: 'boardOpened' }>, existing: { board: Board } | undefined) => {
      dispatch(existing ? { ...file, previous: existing.board } : file)
    },
    [dispatch],
  )

  const openText = useCallback(
    (fileName: string, text: string) => {
      const action = openFromText(fileName, text)
      if (action.type !== 'boardOpened') {
        dispatch(action)
        return
      }
      const id = action.board.id
      const current = appStore.getState()
      const open = current.board?.id === id && current.board && current.overlay ? { board: current.board, overlay: current.overlay } : undefined
      const knownInSpace = open !== undefined || savedRef.current.some((b) => b.id === id)
      if (!knownInSpace || !storeRef.current) {
        dispatch(action)
        return
      }

      const decide = (existing: { board: Board; overlay: Overlay | undefined } | undefined) => {
        const known = existing && existing.overlay ? { board: existing.board, overlay: existing.overlay } : undefined
        // A bare board keeps the notes already here and shows what changed.
        if (!action.overlay) {
          dispatch({ ...action, overlay: known?.overlay, previous: existing?.board })
          return
        }
        if (known && hasHumanWork(known.board, known.overlay) && JSON.stringify(known.overlay) !== JSON.stringify(action.overlay)) {
          setChoice({ title: action.board.title, file: action, existing: known })
          return
        }
        finishOpen(action, existing)
      }

      if (open) {
        decide(open)
        return
      }
      const store = storeRef.current
      const gen = generation.current
      void store
        .loadBoard(id)
        .then((raw) => {
          if (gen !== generation.current) return
          const stored = checkStored(raw)
          if (stored.ok) {
            decide({ board: stored.board, overlay: stored.overlay })
          } else {
            if (raw !== undefined) notice(`What this browser had saved for "${id}" could not be read, so the file opened without it.`)
            dispatch(action)
          }
        })
        .catch(() => {
          if (gen === generation.current) dispatch(action)
        })
    },
    [appStore, dispatch, finishOpen, notice],
  )

  const resolveChoice = useCallback(
    (use: 'file' | 'browser' | undefined) => {
      const pending = choice
      setChoice(undefined)
      if (!pending || use === undefined) return
      const overlay = use === 'file' ? pending.file.overlay : pending.existing.overlay
      dispatch({ ...pending.file, overlay, previous: pending.existing.board })
    },
    [choice, dispatch],
  )

  const openSaved = useCallback(
    (id: string) => {
      void openStored(id)
    },
    [openStored],
  )

  const confirmDelete = useCallback(() => {
    const target = deleting
    setDeleting(undefined)
    const store = storeRef.current
    if (!target || !store) return
    const gen = generation.current
    if (appStore.getState().board?.id === target.id) {
      queueRef.current?.cancel()
      persistedRef.current = undefined
      setPersisted(undefined)
      dispatch({ type: 'closed' })
    }
    void store
      .deleteBoard(target.id)
      .then(() => refreshList(store, gen))
      .catch((error: unknown) => {
        if (gen === generation.current) notice(`The board could not be deleted. ${asStorageError(error).message}`)
      })
  }, [appStore, deleting, dispatch, notice, refreshList])

  const exportNow = useCallback(() => {
    const { board: b, overlay: o } = appStore.getState()
    if (!b || !o) return
    try {
      const now = new Date()
      const text = serializeExport(makeExport(b, o, now))
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `anatomy-${b.id}-${stamp(now)}.json`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      toast('Exported')
    } catch {
      notice('The export file could not be made. Try again.')
    }
  }, [appStore, notice])

  const retrySave = useCallback(() => {
    void queueRef.current?.retry()
  }, [])

  const save: SaveState = useMemo(() => {
    if (!board) return { kind: 'none' }
    if (phase === 'unavailable' && unavailable) return { kind: 'error', error: unavailable }
    if (typeof queueStatus === 'object') return { kind: 'error', error: queueStatus.error }
    const clean = persisted?.board === board && persisted.json === overlayJson
    return clean ? { kind: 'saved' } : { kind: 'saving' }
  }, [board, phase, unavailable, queueStatus, persisted, overlayJson])

  const api: PersistenceApi = {
    space,
    starting: phase === 'starting',
    unavailable,
    save,
    saved,
    deleting,
    choice,
    switchSpace,
    openText,
    openSaved,
    askDelete: setDeleting,
    confirmDelete,
    resolveChoice,
    exportNow,
    retrySave,
  }
  return <PersistenceContext.Provider value={api}>{children}</PersistenceContext.Provider>
}
