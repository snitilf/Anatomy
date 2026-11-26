import { Popover } from '@base-ui/react/popover'
import clsx from 'clsx'
import { FileUp, FolderOpen } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { useCommand } from '../commands/context'
import { ExampleList } from './ExamplesMenu'
import styles from './OpenMenu.module.css'
import rows from './rows.module.css'
import { SavedBoardList } from './SavedBoards'
import { useWorkspace } from './workspaceContext'

/** A press leaves focus on the trigger. Only a keyboard opening moves it into the panel, so no ring flashes on the first button. */
const focusOnKeyboard = (openType: string) => openType === 'keyboard'

/**
 * Every way to open a board: a repository folder, a file, a board saved in this browser, or an example.
 * It is a popover and not a menu because saved boards carry two buttons each, which a menu's single list cannot hold.
 * The top bar's folder crumb is its trigger.
 */
export function OpenMenu({ trigger }: { trigger: ReactElement }) {
  const { saved } = useWorkspace()
  const folder = useCommand('open.folder')
  const file = useCommand('open.file')
  const start = useCommand('start')
  const StartIcon = start.command.icon
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner className={styles.positioner} side="bottom" align="start" sideOffset={6} collisionPadding={12}>
          <Popover.Popup className={styles.panel} aria-label="Open" data-dismissible initialFocus={focusOnKeyboard}>
            {folder.visible && (
              <button
                type="button"
                className={rows.row}
                onClick={() => {
                  close()
                  folder.run()
                }}
              >
                <FolderOpen className={rows.icon} size={14} strokeWidth={1.5} aria-hidden="true" />
                {folder.label}
                <kbd className={clsx(rows.meta, styles.keys)}>{folder.shortcut}</kbd>
              </button>
            )}
            <button
              type="button"
              className={rows.row}
              onClick={() => {
                close()
                file.run()
              }}
            >
              <FileUp className={rows.icon} size={14} strokeWidth={1.5} aria-hidden="true" />
              {file.label}
            </button>
            {saved.length > 0 && (
              <section className={styles.section} aria-labelledby="open-saved">
                <h2 className={styles.heading} id="open-saved">
                  Recent
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
            {start.visible && (
              <div className={styles.section}>
                <button
                  type="button"
                  className={rows.row}
                  onClick={() => {
                    close()
                    start.run()
                  }}
                >
                  <StartIcon className={rows.icon} size={14} strokeWidth={1.5} aria-hidden="true" />
                  {start.label}
                </button>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
