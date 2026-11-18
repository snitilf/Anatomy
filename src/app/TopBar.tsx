import clsx from 'clsx'
import { ChevronDown, PanelRight, Search } from 'lucide-react'
import { useCommand } from '../commands/context'
import { ariaShortcut } from '../commands/keys'
import buttons from './buttons.module.css'
import { BoardCrumbs } from './BoardCrumbs'
import { OpenMenu } from './OpenMenu'
import { SaveStatus } from './SaveStatus'
import { SendMenu } from './SendMenu'
import { SettingsMenu } from './SettingsMenu'
import { useAppStore } from './store'
import { Tip } from './Tip'
import { ViewTabs } from './ViewTabs'
import styles from './TopBar.module.css'
import { useUi } from './ui'
import { useWorkspace } from './workspaceContext'

/** Where the board came from: the folder's name, a file, or an example. It opens the Open popover. */
function Crumb() {
  const { folder, origin } = useWorkspace()
  const name = origin === 'folder' && folder ? folder.name : origin === 'example' ? 'Example' : 'Local file'
  return (
    <OpenMenu
      trigger={
        <button type="button" className={styles.crumb}>
          <span className={styles.crumbText}>{name}</span>
          <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" />
        </button>
      }
    />
  )
}

export function TopBar() {
  const title = useAppStore((s) => s.board?.title)
  const open = useUi((u) => u.sidebar.open)
  const view = useUi((u) => u.view)
  const menu = useCommand('menu')
  const sidebar = useCommand('sidebar.toggle')
  const hasBoard = title !== undefined
  return (
    <header className={styles.bar}>
      {hasBoard ? (
        <>
          <nav className={styles.trail} aria-label="Breadcrumb">
            <Crumb />
            <span className={styles.slash} aria-hidden="true">
              /
            </span>
            <BoardCrumbs title={title} />
          </nav>
          <ViewTabs />
          <div className={styles.save}>
            <SaveStatus />
          </div>
        </>
      ) : (
        <h1 className={styles.wordmark}>Anatomy</h1>
      )}
      <div className={styles.end}>
        <div className={styles.group}>
          <Tip label="Command menu" keys={menu.shortcut}>
            <button type="button" className={clsx(buttons.button, buttons.quiet, styles.control, styles.search)} onClick={menu.run} aria-label="Search" aria-description="Opens the command menu" aria-keyshortcuts={ariaShortcut(menu.command.keys?.[0])} aria-haspopup="dialog">
              <Search size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className={styles.searchWord}>Search</span>
              <kbd className={styles.keys}>{menu.shortcut}</kbd>
            </button>
          </Tip>
        </div>
        <div className={styles.group}>
          <SendMenu className={styles.control} />
        </div>
        <div className={styles.group}>
          {hasBoard && view === 'map' && (
            <Tip label={open ? 'Hide sidebar' : 'Show sidebar'} keys={sidebar.shortcut}>
              <button
                type="button"
                className={clsx(buttons.button, buttons.quiet, buttons.icon, styles.control, styles.square, styles.toggle)}
                onClick={sidebar.run}
                aria-label={open ? 'Hide sidebar' : 'Show sidebar'}
                aria-pressed={open}
              >
                <PanelRight size={16} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </Tip>
          )}
          <SettingsMenu className={clsx(styles.control, styles.square)} />
        </div>
      </div>
    </header>
  )
}
