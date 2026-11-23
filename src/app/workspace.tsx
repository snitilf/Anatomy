import { toast } from 'sonner'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Board } from '../board/schema'
import { parseBoard, type BoardProblem } from '../board/validate'
import { LESSON_IDS } from '../lessons/catalog'
import { makeExport, serializeExport } from '../layer/files'
import { emptyLayer, hasUserWork, serializeLayer, type Layer } from '../layer/model'
import { readLayer } from '../layer/upgrade'
import { openStore, StorageError, type BoardStore, type BoardSummary } from '../workspace/db'
import { browserFolderAccess, canPickFolders, FILES, FileTooLargeError, type FileStamp, type Folder, type FolderAccess } from '../workspace/folder'
import { createSaveQueue, type SaveQueue, type SaveStatus } from '../workspace/saveQueue'
import { watchBoard } from '../workspace/watch'
import { downloadText } from './download'
import { openFromText } from './openFile'
import { useAppDispatch, useAppStore, useAppStoreApi } from './store'
import { isExampleBoard } from './examples'
import { WorkspaceContext, type BoardOrigin, type FileChoice, type FolderStatus, type SaveState, type WorkspaceApi } from './workspaceContext'

/** Where the layer is saved: in this browser, next to the board, or in the repository folder. */
type Sink = { kind: 'browser' } | { kind: 'folder'; folder: Folder }

interface Job {
  sink: Sink
  board: Board
  layer: Layer
}

/** What was last confirmed as written. The toolbar says "saved" when it matches the state. */
interface Persisted {
  sink: Sink
  board: Board
  json: string
}

const BROWSER: Sink = { kind: 'browser' }

type Stored = { ok: true; board: Board; layer: Layer | undefined; warnings: BoardProblem[]; layerProblem: boolean } | { ok: false }

/** Stored data is untrusted. It is checked here before the app uses any of it. */
function checkStored(raw: { board: unknown; layer: unknown } | undefined): Stored {
  if (!raw) return { ok: false }
  const parsed = parseBoard(JSON.stringify(raw.board), { knownLessons: LESSON_IDS })
  if (!parsed.ok) return { ok: false }
  let layer: Layer | undefined
  let layerProblem = false
  if (raw.layer !== undefined) {
    const result = readLayer(raw.layer, parsed.board)
    if (result.ok && result.layer.boardId === parsed.board.id) layer = result.layer
    else layerProblem = true
  }
  return { ok: true, board: parsed.board, layer, warnings: parsed.warnings, layerProblem }
}

function stamp(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
}

function asStorageError(error: unknown): StorageError {
  return error instanceof StorageError ? error : new StorageError('failed', 'Could not use browser storage.', { cause: error })
}

/** Reads the user layer from the folder. A file that cannot be used is kept as a backup and an empty layer starts. */
async function readFolderLayer(folder: Folder, board: Board): Promise<{ layer: Layer; backedUp: boolean }> {
  const file = await folder.read(FILES.layer)
  if (!file) return { layer: emptyLayer(board.id), backedUp: false }
  let result
  try {
    result = readLayer(JSON.parse(file.text), board)
  } catch {
    result = undefined
  }
  if (result?.ok && result.layer.boardId === board.id) return { layer: result.layer, backedUp: false }
  await folder.write(FILES.layerBackup, file.text)
  return { layer: emptyLayer(board.id), backedUp: true }
}

/**
 * Connects the app state to where the work lives: a repository folder (its `.anatomy` files), or this browser.
 * It restores what was open last time, saves every change after a short pause, watches the folder for new revisions,
 * and decides what happens when a file meets saved work. The reducer stays pure. Everything that waits lives here.
 */
export function WorkspaceProvider({ children, folderAccess }: { children: ReactNode; folderAccess?: FolderAccess | undefined }) {
  const appStore = useAppStoreApi()
  const dispatch = useAppDispatch()
  const board = useAppStore((s) => s.board)
  const layer = useAppStore((s) => s.layer)
  const [phase, setPhase] = useState<'starting' | 'ready' | 'unavailable'>('starting')
  const [unavailable, setUnavailable] = useState<StorageError | undefined>()
  const [saved, setSaved] = useState<readonly BoardSummary[]>([])
  const [queueStatus, setQueueStatus] = useState<SaveStatus>('idle')
  const [persisted, setPersisted] = useState<Persisted | undefined>()
  const [deleting, setDeleting] = useState<BoardSummary | undefined>()
  const [choice, setChoice] = useState<FileChoice | undefined>()
  const [sink, setSink] = useState<Sink>(BROWSER)
  const [folder, setFolder] = useState<{ folder: Folder; state: FolderStatus['state'] } | undefined>()
  const [origin, setOrigin] = useState<BoardOrigin | undefined>()

  const storeRef = useRef<BoardStore | undefined>(undefined)
  const persistedRef = useRef<Persisted | undefined>(undefined)
  /** The layer most recently handed to the save queue. It may not be written yet. */
  const scheduledRef = useRef<Persisted | undefined>(undefined)
  const stopWatching = useRef<() => void>(() => {})
  const savedRef = useRef<readonly BoardSummary[]>(saved)
  const sinkRef = useRef<Sink>(sink)
  /** Counts every change of what is open, so a slow read that finishes late is dropped. */
  const generation = useRef(0)
  const [access] = useState<FolderAccess | undefined>(() => folderAccess ?? (canPickFolders() ? browserFolderAccess() : undefined))
  const openFolderLater = useRef<(folder: Folder) => Promise<void>>(async () => {})

  useEffect(() => {
    savedRef.current = saved
  })

  const layerJson = useMemo(() => (layer ? JSON.stringify(layer) : ''), [layer])

  const notice = useCallback((message: string) => dispatch({ type: 'noticeShown', message }), [dispatch])

  const markPersisted = useCallback((value: Persisted | undefined) => {
    persistedRef.current = value
    setPersisted(value)
  }, [])

  const refreshList = useCallback(async () => {
    const store = storeRef.current
    if (!store) return
    try {
      const list = await store.listBoards()
      if (storeRef.current === store) setSaved(list)
    } catch {
      // The list is a convenience. A failed read keeps the old one.
    }
  }, [])

  const write = useCallback(
    async (job: Job) => {
      if (job.sink.kind === 'folder') {
        await job.sink.folder.write(FILES.layer, serializeLayer(job.layer))
      } else {
        const store = storeRef.current
        if (!store) throw new StorageError('unavailable', 'This browser does not allow local storage here.')
        const done = persistedRef.current
        if (done?.sink !== job.sink || done.board !== job.board) {
          await store.saveBoard(job.board)
          await store.setLastOpened({ mode: 'file', boardId: job.board.id })
        }
        await store.saveLayer(job.layer)
      }
      // The write is confirmed. Only now does the toolbar say "saved".
      persistedRef.current = { sink: job.sink, board: job.board, json: JSON.stringify(job.layer) }
      setPersisted(persistedRef.current)
      if (job.sink.kind === 'browser') void refreshList()
    },
    [refreshList],
  )
  const queueRef = useRef<SaveQueue<Job> | undefined>(undefined)
  useEffect(() => {
    const queue = createSaveQueue<Job>(write)
    queueRef.current = queue
    const off = queue.onStatus(setQueueStatus)
    return () => {
      off()
      void queue.flush()
    }
  }, [write])

  const switchSink = useCallback((next: Sink) => {
    sinkRef.current = next
    setSink(next)
  }, [])

  const stopWatch = useCallback(() => {
    stopWatching.current()
    stopWatching.current = () => {}
  }, [])

  const leaveFolder = useCallback(() => {
    stopWatch()
    setFolder(undefined)
    if (sinkRef.current.kind === 'folder') switchSink(BROWSER)
  }, [stopWatch, switchSink])

  /** Opens a board from this browser's storage. */
  const openStored = useCallback(
    async (id: string, options: { quiet?: boolean } = {}) => {
      const store = storeRef.current
      if (!store) return
      const gen = ++generation.current
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
      if (stored.layerProblem) {
        notice(`The notes saved in this browser for "${stored.board.title}" could not be read, so the board was not opened. Open its file again to replace them.`)
        return
      }
      const layer = stored.layer ?? emptyLayer(stored.board.id)
      leaveFolder()
      // The stored board is already saved. Only the choice of what was opened last is new.
      markPersisted({ sink: BROWSER, board: stored.board, json: JSON.stringify(layer) })
      setOrigin(isExampleBoard(stored.board.id) ? 'example' : 'file')
      void store.setLastOpened({ mode: 'file', boardId: stored.board.id }).catch(() => {})
      dispatch({ type: 'boardOpened', board: stored.board, layer, warnings: stored.warnings, now: new Date() })
    },
    [dispatch, leaveFolder, markPersisted, notice],
  )

  /** Opens the board in a repository folder, reads the layer next to it, and starts watching for new revisions. */
  const openFolderNow = useCallback(
    async (target: Folder): Promise<void> => {
      const gen = ++generation.current
      await queueRef.current?.flush()
      if (gen !== generation.current) return
      let file: { text: string; stamp: FileStamp } | undefined
      let tooLarge: FileTooLargeError | undefined
      try {
        file = await target.read(FILES.board)
      } catch (error) {
        if (error instanceof FileTooLargeError) tooLarge = error
        else {
          if (gen === generation.current) notice(`Anatomy could not read the folder ${target.name}.`)
          return
        }
      }
      if (gen !== generation.current) return
      // The folder becomes the place work is saved only once it is settled what opens, in the same step as the dispatch.
      // Until then the board that is open keeps its own place, so its layer is never written into this folder.
      const settle = () => {
        stopWatch()
        void access?.remember(target).catch(() => {})
        void storeRef.current?.setLastOpened({ mode: 'folder' }).catch(() => {})
        switchSink({ kind: 'folder', folder: target })
        markPersisted(undefined)
      }

      const watch = (seen: FileStamp | undefined) => {
        stopWatching.current = watchBoard(target, {
          seen,
          knownLessons: LESSON_IDS,
          revision: () => appStore.getState().board?.revision ?? 0,
          onBoard: (next, warnings) => {
            const open = appStore.getState().board
            // A new revision of the open board goes through the update review. Anything else opens like the folder itself.
            if (open?.id === next.id) dispatch({ type: 'boardOpened', board: next, warnings, previous: open, now: new Date() })
            else void openFolderLater.current(target)
          },
        })
      }

      if (tooLarge) {
        // The folder opened, but the board in it is too large to read. It is reported the way a bad board is.
        settle()
        setFolder({ folder: target, state: 'open' })
        dispatch({ type: 'closed' })
        dispatch({ type: 'openFailed', fileName: `${target.name}/.anatomy/${FILES.board}`, errors: [{ path: '', message: tooLarge.message }] })
        watch(undefined)
        return
      }
      if (!file) {
        settle()
        setFolder({ folder: target, state: 'missing' })
        dispatch({ type: 'closed' })
        watch(undefined)
        return
      }
      const parsed = parseBoard(file.text, { knownLessons: LESSON_IDS })
      if (!parsed.ok) {
        settle()
        setFolder({ folder: target, state: 'open' })
        dispatch({ type: 'closed' })
        dispatch({ type: 'openFailed', fileName: `${target.name}/.anatomy/${FILES.board}`, errors: parsed.errors })
        watch(file.stamp)
        return
      }
      let found
      try {
        found = await readFolderLayer(target, parsed.board)
      } catch {
        found = undefined
      }
      if (gen !== generation.current) return
      if (!found) {
        notice(`Anatomy could not read ${FILES.layer} in ${target.name}, so the board was not opened.`)
        return
      }
      settle()
      setFolder({ folder: target, state: 'open' })
      setOrigin('folder')
      markPersisted({ sink: sinkRef.current, board: parsed.board, json: JSON.stringify(found.layer) })
      dispatch({ type: 'boardOpened', board: parsed.board, layer: found.layer, warnings: parsed.warnings, now: new Date() })
      if (found.backedUp) notice(`${FILES.layer} could not be read, so it was kept as ${FILES.layerBackup} and a new one starts.`)
      watch(file.stamp)
    },
    [access, appStore, dispatch, markPersisted, notice, stopWatch, switchSink],
  )

  useEffect(() => {
    openFolderLater.current = openFolderNow
  }, [openFolderNow])

  const shutdown = useCallback(() => {
    generation.current++
    stopWatch()
    storeRef.current?.close()
    storeRef.current = undefined
  }, [stopWatch])

  // Connect once. A second run (React strict mode) closes the first connection and opens its own.
  useEffect(() => {
    let live = true
    void (async () => {
      let store: BoardStore
      try {
        store = await openStore()
      } catch (error) {
        if (!live) return
        setUnavailable(asStorageError(error))
        setPhase('unavailable')
        return
      }
      if (!live) {
        store.close()
        return
      }
      storeRef.current = store
      setPhase('ready')
      // A folder opened while storage was starting could not be remembered yet.
      const early = sinkRef.current
      if (early.kind === 'folder') {
        void access?.remember(early.folder).catch(() => {})
        void store.setLastOpened({ mode: 'folder' }).catch(() => {})
      }
      await refreshList()
      let last
      try {
        last = await store.getLastOpened()
      } catch {
        return
      }
      // A board the user opened while storage was starting wins over the last one.
      if (!live || last === undefined || appStore.getState().board !== undefined || sinkRef.current.kind === 'folder') return
      if (last.mode === 'file') {
        await openStored(last.boardId, { quiet: true })
        return
      }
      const remembered = await access?.recall().catch(() => undefined)
      if (!remembered || !live) return
      const permission = await remembered.permission(false).catch(() => 'denied' as const)
      if (!live) return
      if (permission === 'granted') await openFolderNow(remembered)
      else setFolder({ folder: remembered, state: 'reopen' })
    })()
    return () => {
      live = false
      shutdown()
    }
  }, [access, appStore, openFolderNow, openStored, refreshList, shutdown])

  // Save after every change to the board or the layer.
  useEffect(() => {
    const queue = queueRef.current
    if (!board || !layer || !queue) return
    if (sink.kind === 'browser' && phase !== 'ready') return
    const done = persistedRef.current
    // The folder's board is the agent's file, so only the layer counts there.
    const same = (p: Persisted | undefined): p is Persisted => p?.sink === sink && (sink.kind === 'folder' || p.board === board)
    const sameBoard = same(done)
    // Compared with what is waiting to be written, not only with what was written: an undo and a quick redo bring
    // back the written layer while the undone one still waits, and that one must not be the last write.
    const waiting = scheduledRef.current
    if (sameBoard && (same(waiting) ? waiting.json : done.json) === layerJson) return
    if (sameBoard) {
      scheduledRef.current = { sink, board, json: layerJson }
      queue.schedule({ sink, board, layer })
      return
    }
    scheduledRef.current = undefined
    // A new board, a new version, or a new place: write it now, after anything still waiting for the old one.
    void queue.flush().then(() => {
      const s = appStore.getState()
      if (s.board && s.layer && sinkRef.current === sink) {
        queue.schedule({ sink, board: s.board, layer: s.layer })
        void queue.flush()
      }
    })
  }, [appStore, board, layer, layerJson, phase, sink])

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

  const openFolder = useCallback(() => {
    if (!access) return
    void access
      .pick()
      .then((picked) => (picked ? openFolderNow(picked) : undefined))
      .catch(() => notice('Anatomy could not open that folder.'))
  }, [access, notice, openFolderNow])

  const reopenFolder = useCallback(() => {
    const remembered = folder?.folder
    if (!remembered) return
    void remembered
      .permission(true)
      .then((permission) => (permission === 'granted' ? openFolderNow(remembered) : undefined))
      .catch(() => notice(`Anatomy could not open ${remembered.name}.`))
  }, [folder, notice, openFolderNow])

  const writeFolderFile = useCallback<WorkspaceApi['writeFolderFile']>(
    async (file, text, options = {}) => {
      if (!folder || folder.state === 'reopen') return false
      try {
        if (options.onlyIfMissing && (await folder.folder.stat(file)) !== undefined) return true
        if (options.keep) {
          // A file too large to be one of ours is somebody else's, so it is kept.
          const existing = await folder.folder.read(file).catch((error: unknown) => {
            if (error instanceof FileTooLargeError) return { text: '', stamp: undefined, large: true as const }
            throw error
          })
          if (existing && ('large' in existing || options.keep(existing.text))) return true
        }
        await folder.folder.write(file, text)
        return true
      } catch {
        return false
      }
    },
    [folder],
  )

  const openText = useCallback(
    (fileName: string, text: string, from: Exclude<BoardOrigin, 'folder'> = 'file') => {
      const action = openFromText(fileName, text)
      if (action.type !== 'boardOpened') {
        dispatch(action)
        return
      }
      generation.current++
      leaveFolder()
      setOrigin(from)
      const id = action.board.id
      const current = appStore.getState()
      const open = current.board?.id === id && current.board && current.layer ? { board: current.board, layer: current.layer } : undefined
      const known = open !== undefined || savedRef.current.some((b) => b.id === id)
      const store = storeRef.current
      if (!known || !store) {
        dispatch(action)
        return
      }

      const decide = (existing: { board: Board; layer: Layer | undefined } | undefined) => {
        // A bare board keeps the notes already here and shows what changed.
        if (!action.layer) {
          dispatch({ ...action, layer: existing?.layer, previous: existing?.board })
          return
        }
        if (existing?.layer && hasUserWork(existing.layer) && JSON.stringify(existing.layer) !== JSON.stringify(action.layer)) {
          setChoice({ title: action.board.title, file: action, existing: { board: existing.board, layer: existing.layer } })
          return
        }
        dispatch(existing ? { ...action, previous: existing.board } : action)
      }

      if (open) {
        decide(open)
        return
      }
      const gen = generation.current
      void store
        .loadBoard(id)
        .then((raw) => {
          if (gen !== generation.current) return
          const stored = checkStored(raw)
          if (stored.ok) {
            decide({ board: stored.board, layer: stored.layer })
          } else {
            if (raw !== undefined) notice(`What this browser had saved for "${id}" could not be read, so the file opened without it.`)
            dispatch(action)
          }
        })
        .catch(() => {
          if (gen === generation.current) dispatch(action)
        })
    },
    [appStore, dispatch, leaveFolder, notice],
  )

  const resolveChoice = useCallback(
    (use: 'file' | 'browser' | undefined) => {
      const pending = choice
      setChoice(undefined)
      if (!pending || use === undefined) return
      const layer = use === 'file' ? pending.file.layer : pending.existing.layer
      dispatch({ ...pending.file, layer, previous: pending.existing.board })
    },
    [choice, dispatch],
  )

  const openSaved = useCallback((id: string) => void openStored(id), [openStored])

  const confirmDelete = useCallback(() => {
    const target = deleting
    setDeleting(undefined)
    const store = storeRef.current
    if (!target || !store) return
    const state = appStore.getState()
    if (state.board?.id === target.id && sinkRef.current.kind === 'browser') {
      queueRef.current?.cancel()
      markPersisted(undefined)
      dispatch({ type: 'closed' })
    }
    void store
      .deleteBoard(target.id)
      .then(refreshList)
      .catch((error: unknown) => notice(`The board could not be deleted. ${asStorageError(error).message}`))
  }, [appStore, deleting, dispatch, markPersisted, notice, refreshList])

  const exportNow = useCallback(() => {
    const { board: b, layer: l } = appStore.getState()
    if (!b || !l) return
    try {
      const now = new Date()
      downloadText(`anatomy-${b.id}-${stamp(now)}.json`, serializeExport(makeExport(b, l, now)))
      toast('Downloaded')
    } catch {
      notice('The export file could not be made. Try again.')
    }
  }, [appStore, notice])

  const retrySave = useCallback(() => void queueRef.current?.retry(), [])

  const save: SaveState = useMemo(() => {
    if (!board) return { kind: 'none' }
    if (sink.kind === 'browser' && phase === 'unavailable' && unavailable) return { kind: 'error', error: unavailable }
    if (typeof queueStatus === 'object') return { kind: 'error', error: queueStatus.error }
    const clean = persisted?.sink === sink && (sink.kind === 'folder' || persisted.board === board) && persisted.json === layerJson
    return clean ? { kind: 'saved', where: sink.kind } : { kind: 'saving' }
  }, [board, sink, phase, unavailable, queueStatus, persisted, layerJson])

  const api: WorkspaceApi = {
    folder: folder ? { name: folder.folder.name, state: folder.state } : undefined,
    origin: board ? origin : undefined,
    canOpenFolder: access !== undefined,
    starting: phase === 'starting',
    unavailable,
    save,
    saved,
    deleting,
    choice,
    openFolder,
    reopenFolder,
    writeFolderFile,
    openText,
    openSaved,
    askDelete: setDeleting,
    confirmDelete,
    resolveChoice,
    exportNow,
    retrySave,
  }
  return <WorkspaceContext.Provider value={api}>{children}</WorkspaceContext.Provider>
}
