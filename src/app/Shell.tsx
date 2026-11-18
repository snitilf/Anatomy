import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FocusEvent } from 'react'
import { toast } from 'sonner'
import { Canvas } from '../canvas/Canvas'
import { CameraSlotContext, createCameraSlot } from '../canvas/cameraContext'
import { CommandMenu } from '../commands/CommandMenu'
import { CommandsProvider } from '../commands/CommandsProvider'
import type { ShellActions } from '../commands/types'
import { Sidebar } from '../inspector/Sidebar'
import { WalkthroughBar } from '../scenarios/WalkthroughBar'
import { agentReadme, FIRST_BOARD_PROMPT, keepReadme } from './agentReadme'
import { copyText } from './clipboard'
import { Dialogs } from './Dialogs'
import { EmptyState } from './EmptyState'
import { HowToDialog } from './HowToDialog'
import { Notices } from './Notices'
import { readFileText } from './openFile'
import styles from './Shell.module.css'
import { useAppDispatch, useAppStore, useAppStoreApi } from './store'
import { TipProvider } from './Tip'
import { TopBar } from './TopBar'
import { createUi, UiContext, useUi, useUiApi } from './ui'
import { OverviewPage } from '../overview/OverviewPage'
import { entryBoard, rememberedView, rememberView, viewFromHash, writeHash } from './view'
import { useWorkspace } from './workspaceContext'

/** Elements on the map that can hold keyboard focus. */
const MAP_FOCUS = '.react-flow__node, .react-flow__edge'

/**
 * After Escape clears the selection, focus must not fall to the page. It returns to the last map element, or the panel heading.
 * It lives apart so that Shell itself does not render again for every selection.
 */
function RestoreFocus({ pending, restore }: { pending: { current: boolean }; restore: () => void }) {
  const selection = useAppStore((s) => s.selection)
  useEffect(() => {
    if (!pending.current) return
    pending.current = false
    restore()
    // The selection is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])
  return null
}

export function Shell() {
  const [ui] = useState(createUi)
  const [camera] = useState(createCameraSlot)
  return (
    <UiContext.Provider value={ui}>
      <CameraSlotContext.Provider value={camera}>
        <TipProvider>
          <ShellBody />
        </TipProvider>
      </CameraSlotContext.Provider>
    </UiContext.Provider>
  )
}

/**
 * Keeps the view and the address together. Back and forward change the view. A board opens on the view last used on it,
 * or on the map the first time.
 */
function useViewSync(boardId: string | undefined) {
  const ui = useUiApi()
  const store = useAppStoreApi()
  useEffect(() => {
    const onPop = () => {
      const id = store.getState().board?.id
      const from = entryBoard(window.history.state)
      // An entry made for another board says nothing about this one. The address goes back to the view in front.
      if (id && from !== undefined && from !== id) {
        writeHash(ui.store.getState().view, false, id)
        return
      }
      const view = viewFromHash(window.location.hash)
      ui.setViewState(view)
      if (id) rememberView(id, view)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [ui, store])
  useEffect(() => {
    if (!boardId) return
    const view = rememberedView(boardId)
    writeHash(view, false, boardId)
    ui.setViewState(view)
  }, [boardId, ui])
}

function ShellBody() {
  const hasBoard = useAppStore((s) => s.board !== undefined)
  const boardId = useAppStore((s) => s.board?.id)
  const overview = useUi((u) => u.view) === 'overview' && hasBoard
  useViewSync(boardId)
  const store = useAppStoreApi()
  const scenario = useAppStore((s) => s.scenario !== undefined)
  const dispatch = useAppDispatch()
  const uiApi = useUiApi()
  const sidebar = useUi((u) => u.sidebar)
  const howTo = useUi((u) => u.howToOpen)
  const { openText, writeFolderFile } = useWorkspace()
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const playOrigin = useRef<HTMLElement | null>(null)
  // The card or connection that last had focus, so Escape can give focus back to it.
  const lastOnMap = useRef<HTMLElement | null>(null)
  const restoreFocus = useRef(false)
  const wasPlaying = useRef(false)
  const main = useRef<HTMLElement>(null)

  const sidebarHeading = () => main.current?.querySelector<HTMLElement>('aside h2') ?? null
  const focusIfLost = (target: HTMLElement | null) => {
    const active = document.activeElement
    if (active && active !== document.body) return
    if (target?.isConnected) target.focus()
    else sidebarHeading()?.focus()
  }

  // Focus that sat in the start screen is lost when a board replaces it. It goes to the panel heading.
  const usedStart = useRef(false)
  useEffect(() => {
    if (!hasBoard || !usedStart.current) return
    usedStart.current = false
    const timer = window.setTimeout(() => focusIfLost(null), 50)
    return () => window.clearTimeout(timer)
    // focusIfLost only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBoard])

  // After the player closes, focus goes back to the Play button, or to the panel heading if that button is gone.
  useEffect(() => {
    if (scenario || !wasPlaying.current) return
    wasPlaying.current = false
    const origin = playOrigin.current
    if (origin?.isConnected) origin.focus()
    else sidebarHeading()?.focus()
  }, [scenario])

  async function openFile(file: File | undefined) {
    if (!file) return
    const read = await readFileText(file)
    if (read.ok) openText(file.name, read.text)
    else dispatch({ type: 'openFailed', fileName: file.name, errors: [{ path: '', message: read.message }] })
  }

  function onPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    void openFile(file)
  }

  const shell = useMemo<ShellActions>(
    () => ({
      openFile: () => input.current?.click(),
      toOverview: () => {
        const selection = store.getState().selection
        if (!selection || selection.type === 'board') return
        restoreFocus.current = true
        dispatch({ type: 'select', selection: { type: 'board' } })
      },
      closeWalkthrough: () => {
        wasPlaying.current = true
        dispatch({ type: 'scenarioStopped' })
      },
      playWalkthrough: (id) => {
        const active = document.activeElement
        playOrigin.current = active instanceof HTMLElement && active !== document.body ? active : null
        dispatch({ type: 'scenarioStarted', id })
      },
      copyPrompt: () => {
        // The copy runs first, inside the click, where the browser still allows it.
        void copyText(FIRST_BOARD_PROMPT).then((ok) => {
          if (ok) toast('Prompt copied')
          else toast('Could not copy. Open How to make a board and copy the prompt there.')
        })
        void writeFolderFile('README.md', agentReadme(), { keep: keepReadme })
      },
    }),
    [dispatch, store, writeFolderFile],
  )

  // Drop a .json file anywhere on the window to open it.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false
    let depth = 0
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      void openFile(e.dataTransfer?.files[0])
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onFocus(event: FocusEvent<HTMLElement>) {
    if (!hasBoard) usedStart.current = true
    const el = (event.target as HTMLElement).closest<HTMLElement>(MAP_FOCUS)
    if (el) lastOnMap.current = el
  }

  const closeHowTo = useCallback(() => uiApi.setHowToOpen(false), [uiApi])

  return (
    <CommandsProvider shell={shell}>
      <div className={styles.shell}>
        <TopBar />
        <main
          ref={main}
          className={styles.main}
          data-empty={hasBoard ? undefined : ''}
          data-sidebar={hasBoard && sidebar.open ? '' : undefined}
          data-playing={scenario ? '' : undefined}
          data-view={hasBoard ? (overview ? 'overview' : 'map') : undefined}
          style={{ '--sidebar-width': `${sidebar.width}px` } as CSSProperties}
          onFocus={onFocus}
        >
          <div className={styles.panel}>
            <div className={styles.notices} data-notices="">
              <Notices />
            </div>
            {hasBoard ? (
              <>
                <div className={styles.canvas} inert={overview}>
                  <Canvas />
                  {scenario && <WalkthroughBar />}
                </div>
                <Sidebar />
                {overview && <OverviewPage />}
              </>
            ) : (
              <EmptyState />
            )}
          </div>
        </main>
        <input ref={input} type="file" name="board-file" accept=".json,application/json" hidden onChange={onPicked} aria-label="Board file" />
        <RestoreFocus pending={restoreFocus} restore={() => focusIfLost(lastOnMap.current)} />
        <Dialogs />
        <HowToDialog open={howTo} onClose={closeHowTo} />
        <CommandMenu />
        {dragging && (
          <div className={styles.drop} aria-hidden="true">
            <p>Drop to open</p>
          </div>
        )}
      </div>
    </CommandsProvider>
  )
}
