import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Canvas } from '../canvas/Canvas'
import { Inspector } from '../inspector/Inspector'
import { useAppDispatch, useAppState } from './appContext'
import { EmptyState } from './EmptyState'
import { HowToDialog } from './HowToDialog'
import { Notices } from './Notices'
import { openFromFile } from './openFile'
import styles from './Shell.module.css'
import { Toolbar } from './Toolbar'

export function Shell({ onOpenLesson }: { onOpenLesson?: ((lessonId: string) => void) | undefined }) {
  const { board, selection } = useAppState()
  const dispatch = useAppDispatch()
  const input = useRef<HTMLInputElement>(null)
  const [howTo, setHowTo] = useState(false)
  const [dragging, setDragging] = useState(false)

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

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && board && selection && selection.type !== 'board') {
      dispatch({ type: 'select', selection: { type: 'board' } })
    }
  }

  const openPicker = () => input.current?.click()

  return (
    <div className={styles.shell}>
      <Toolbar onOpen={openPicker} onHowTo={() => setHowTo(true)} />
      <Notices />
      <main className={styles.main} data-empty={board ? undefined : ''} onKeyDown={onKeyDown}>
        {board ? (
          <>
            <div className={styles.canvas}>
              <Canvas />
            </div>
            <Inspector onOpenLesson={onOpenLesson} />
          </>
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
