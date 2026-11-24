import { createContext, useContext } from 'react'
import { useStore, type StoreApi } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { Editing, Tool } from '../whiteboard/tools'
import { viewFromHash, type View } from './view'

/**
 * The state of the screen around the board: the sidebar, the open menus and dialogs.
 * None of it is undoable and none of it belongs to the board. Width and collapse are kept per browser.
 */
export interface UiState {
  sidebar: { open: boolean; width: number }
  /** Which sidebar groups the user opened or closed, by group name. A group that is not here follows its default. */
  groups: Record<string, boolean>
  /** The map or the Overview page. The URL hash is its source; `useViewSync` keeps the two together. */
  view: View
  tab: 'details' | 'review'
  menuOpen: boolean
  /** The Send to agent popover. */
  sendOpen: boolean
  howToOpen: boolean
  /**
   * The lesson dialog that is open. It is held here, not in the row that opened it, so it survives the sidebar becoming the phone sheet.
   * `opener` names the row to give focus back to when it closes: the id of the part the lesson belongs to.
   */
  lesson?: { id: string; opener: string } | undefined
  lineKeyOpen: boolean
  /** The phone bottom sheet: 0 shows only its header, 1 half the screen, 2 the full height. */
  sheet: 0 | 1 | 2
  /** Set when a command asks the part view for its link picker. Counts up so the same request twice still opens it. */
  linkPicker: number
  /** Set when a command asks for the note composer. */
  composer: number
  /** The whiteboard tool in use. */
  tool: Tool
  /** Space is held: the map pans from anywhere, whatever the tool. */
  spaceHand: boolean
  /** Text being typed on the map. */
  editing?: Editing | undefined
}

export const SIDEBAR = { width: 360, min: 300, max: 520 } as const
const KEY = 'anatomy:sidebar'

const clampWidth = (w: number) => Math.round(Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, w)))

function readSidebar(): UiState['sidebar'] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as unknown
    if (raw && typeof raw === 'object') {
      const { open, width } = raw as { open?: unknown; width?: unknown }
      return { open: open !== false, width: typeof width === 'number' && Number.isFinite(width) ? clampWidth(width) : SIDEBAR.width }
    }
  } catch {
    // Unreadable or blocked storage: the defaults.
  }
  return { open: true, width: SIDEBAR.width }
}

function readGroups(): Record<string, boolean> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as { groups?: unknown } | null
    const groups: Record<string, boolean> = {}
    if (raw && typeof raw.groups === 'object' && raw.groups !== null) {
      for (const [name, open] of Object.entries(raw.groups)) if (typeof open === 'boolean') groups[name] = open
    }
    return groups
  } catch {
    return {}
  }
}

function writeSidebar(sidebar: UiState['sidebar'], groups: UiState['groups']) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...sidebar, groups }))
  } catch {
    // Without storage the sidebar starts at its default next time.
  }
}

export interface UiApi {
  store: StoreApi<UiState>
  setSidebarOpen(open: boolean): void
  toggleSidebar(): void
  setSidebarWidth(width: number, persist?: boolean): void
  setGroup(name: string, open: boolean): void
  setTab(tab: UiState['tab']): void
  /** Only the state. The address is written by the shell. */
  setViewState(view: View): void
  setMenuOpen(open: boolean): void
  setSendOpen(open: boolean): void
  setHowToOpen(open: boolean): void
  openLesson(id: string, opener: string): void
  closeLesson(): void
  setLineKeyOpen(open: boolean): void
  setSheet(stop: UiState['sheet']): void
  askLinkPicker(): void
  askComposer(): void
  setTool(tool: Tool): void
  setSpaceHand(held: boolean): void
  setEditing(editing: Editing | undefined): void
}

export function createUi(): UiApi {
  const store = createStore<UiState>(() => ({
    sidebar: typeof window === 'undefined' ? { open: true, width: SIDEBAR.width } : readSidebar(),
    groups: typeof window === 'undefined' ? {} : readGroups(),
    view: typeof window === 'undefined' ? 'map' : viewFromHash(window.location.hash),
    tab: 'details',
    menuOpen: false,
    sendOpen: false,
    howToOpen: false,
    lineKeyOpen: false,
    sheet: 0,
    linkPicker: 0,
    composer: 0,
    tool: 'select',
    spaceHand: false,
  }))
  const setSidebar = (sidebar: UiState['sidebar'], persist = true) => {
    store.setState({ sidebar })
    if (persist) writeSidebar(sidebar, store.getState().groups)
  }
  return {
    store,
    setSidebarOpen: (open) => setSidebar({ ...store.getState().sidebar, open }),
    toggleSidebar: () => {
      const s = store.getState().sidebar
      setSidebar({ ...s, open: !s.open })
    },
    setSidebarWidth: (width, persist = true) => setSidebar({ ...store.getState().sidebar, width: clampWidth(width) }, persist),
    setGroup: (name, open) => {
      store.setState((s) => ({ groups: { ...s.groups, [name]: open } }))
      writeSidebar(store.getState().sidebar, store.getState().groups)
    },
    setTab: (tab) => store.setState({ tab }),
    setViewState: (view) => store.setState({ view }),
    setMenuOpen: (menuOpen) => store.setState({ menuOpen }),
    setSendOpen: (sendOpen) => store.setState({ sendOpen }),
    setHowToOpen: (howToOpen) => store.setState({ howToOpen }),
    openLesson: (id, opener) => store.setState({ lesson: { id, opener } }),
    closeLesson: () => store.setState((s) => (s.lesson === undefined ? s : { lesson: undefined })),
    setLineKeyOpen: (lineKeyOpen) => store.setState({ lineKeyOpen }),
    setSheet: (sheet) => store.setState({ sheet }),
    askLinkPicker: () => store.setState((s) => ({ linkPicker: s.linkPicker + 1 })),
    askComposer: () => store.setState((s) => ({ composer: s.composer + 1 })),
    setTool: (tool) => store.setState({ tool }),
    setSpaceHand: (spaceHand) => store.setState({ spaceHand }),
    setEditing: (editing) => store.setState({ editing }),
  }
}

export const UiContext = createContext<UiApi | undefined>(undefined)

export function useUiApi(): UiApi {
  const ui = useContext(UiContext)
  if (!ui) throw new Error('The UI store is missing. Wrap the tree in UiContext.')
  return ui
}

export function useUi<T>(selector: (state: UiState) => T): T {
  return useStore(useUiApi().store, selector)
}
