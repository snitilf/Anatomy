import { Popover } from '@base-ui/react/popover'
import { ChevronDown, FileUp, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import buttons from './buttons.module.css'
import { ExampleList } from './ExamplesMenu'
import styles from './OpenMenu.module.css'
import { useWorkspace } from './workspaceContext'
import { SavedBoardList } from './SavedBoards'
import { useAppStore } from './store'

/** A press leaves focus on the trigger. Only a keyboard opening moves it into the panel, so no ring flashes on the first button. */
const focusOnKeyboard = (openType: string) => openType === 'keyboard'

/**
 * One toolbar popover for every way to open a board: a file, a repository folder, a saved board, or an example.
 * It is a popover and not a menu because the panel mixes lists with two buttons on each saved board,
 * which a menu's single arrow-key list cannot express. Tab walks through the buttons.
 * Escape, a click outside, or moving focus away closes it, and focus returns to the trigger.
 */
export function OpenMenu({ onOpenFile }: { onOpenFile: () => void }) {
  const { saved, canOpenFolder, openFolder } = useWorkspace()
  const hasBoard = useAppStore((s) => s.board !== undefined)
  const [open, setOpen] = useState(false)

  // With no board open, the start screen has these choices itself.
  if (!hasBoard) return null
  const close = () => setOpen(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={buttons.button}>
        Open
        <ChevronDown className={styles.caret} size={16} strokeWidth={1.5} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className={styles.positioner} side="bottom" align="end" sideOffset={6} collisionPadding={12}>
          <Popover.Popup className={styles.panel} aria-label="Open a board" data-dismissible initialFocus={focusOnKeyboard}>
            <button
              type="button"
              className={styles.file}
              onClick={() => {
                close()
                onOpenFile()
              }}
            >
              <FileUp size={16} strokeWidth={1.5} aria-hidden="true" />
              Open a file
            </button>
            {canOpenFolder && (
              <button
                type="button"
                className={styles.file}
                onClick={() => {
                  close()
                  openFolder()
                }}
              >
                <FolderOpen size={16} strokeWidth={1.5} aria-hidden="true" />
                Open a repository folder
              </button>
            )}
            {saved.length > 0 && (
              <section className={styles.section} aria-labelledby="open-saved">
                <h2 className={styles.heading} id="open-saved">
                  Saved in this browser
                </h2>
                <SavedBoardList onChosen={close} />
              </section>
            )}
            <section className={styles.section} aria-labelledby="open-examples">
              <h2 className={styles.heading} id="open-examples">
                Examples
              </h2>
              <ExampleList onChosen={close} />
            </section>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
