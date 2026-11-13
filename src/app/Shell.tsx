import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react'
import { Canvas } from '../canvas/Canvas'
import { Inspector } from '../inspector/Inspector'
import { PlayOriginContext } from '../scenarios/focus'
import { ScenarioPlayer } from '../scenarios/ScenarioPlayer'
import { useAppDispatch, useAppState } from './appContext'
import { EmptyState } from './EmptyState'
import { HowToDialog } from './HowToDialog'
import { Notices } from './Notices'
import { openFromFile } from './openFile'
import styles from './Shell.module.css'
import { Toolbar } from './Toolbar'

/** Elements on the map that can hold keyboard focus. */
const MAP_FOCUS = '.react-flow__node, .react-flow__edge'

export function Shell() {
  const { board, selection, scenario } = useAppState()
  const dispatch = useAppDispatch()
  const input = useRef<HTMLInputElement>(null)
  const [howTo, setHowTo] = useState(false)
  const [dragging, setDragging] = useState(false)
  const playOrigin = useRef<HTMLElement | null>(null)
  // The card or connection that last had focus, so Escape can give focus back to it.
  const lastOnMap = useRef<HTMLElement | null>(null)
  const restoreFocus = useRef(false)
  const wasPlaying = useRef(false)
  const main = useRef<HTMLElement>(null)

  const inspectorHeading = () => main.current?.querySelector<HTMLElement>('aside h2') ?? null
  const focusIfLost = (target: HTMLElement | null) => {
    const active = document.activeElement
    if (active && active !== document.body) return
    if (target?.isConnected) target.focus()
    else inspectorHeading()?.focus()
  }

  const closePlayer = () => {
    wasPlaying.current = true
    dispatch({ type: 'scenarioStopped' })
  }

  // After the player closes, focus goes back to the Play button, or to the panel heading if that button is gone.
  useEffect(() => {
    if (scenario || !wasPlaying.current) return
    wasPlaying.current = false
    const origin = playOrigin.current
    if (origin?.isConnected) origin.focus()
    else inspectorHeading()?.focus()
  }, [scenario])

  // After Escape clears the selection, focus must not fall to the page. It returns to the last map element, or the panel heading.
  useEffect(() => {
    if (!restoreFocus.current) return
    restoreFocus.current = false
    focusIfLost(lastOnMap.current)
  }, [selection])

  async function openFile(file: File | undefined) {
    if (file) dispatch(await openFromFile(file))
  }

  function onPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    void openFile(file)
  }

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
    const el = (event.target as HTMLElement).closest<HTMLElement>(MAP_FOCUS)
    if (el) lastOnMap.current = el
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !board) return
    // A dialog handles its own Escape.
    if ((event.target as HTMLElement).closest('dialog')) return
    if (scenario) {
      closePlayer()
    } else if (selection && selection.type !== 'board') {
      restoreFocus.current = true
      dispatch({ type: 'select', selection: { type: 'board' } })
    }
  }

  const openPicker = () => input.current?.click()

  return (
    <div className={styles.shell}>
      <Toolbar onOpen={openPicker} onHowTo={() => setHowTo(true)} />
      <Notices />
      <main
        ref={main}
        className={styles.main}
        data-empty={board ? undefined : ''}
        data-playing={scenario ? '' : undefined}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        {board ? (
          <PlayOriginContext.Provider value={playOrigin}>
            <div className={styles.canvas}>
              <div className={styles.map}>
                <Canvas />
              </div>
              {scenario && <ScenarioPlayer onClose={closePlayer} />}
            </div>
            <Inspector />
          </PlayOriginContext.Provider>
        ) : (
          <EmptyState onOpen={openPicker} onHowTo={() => setHowTo(true)} />
        )}
      </main>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={onPicked} aria-label="Board file" />
      <HowToDialog open={howTo} onClose={() => setHowTo(false)} />
      {dragging && (
        <div className={styles.drop} aria-hidden="true">
          <p>Drop a .json file to open it</p>
        </div>
      )}
    </div>
  )
}
