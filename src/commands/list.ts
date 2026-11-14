import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileUp,
  FolderOpen,
  Inbox,
  Link2,
  Maximize,
  Minus,
  Monitor,
  Moon,
  PanelRight,
  Play,
  Plus,
  Redo2,
  Scan,
  Search,
  Spline,
  StickyNote,
  Sun,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { EXAMPLES } from '../app/examples'
import { setThemeMode, getThemeMode, type ThemeMode } from '../theme/theme'
import { reviewCounts } from '../notes/review'
import { deletedToast } from '../notes/undoToast'
import type { Rect } from '../layout/geometry'
import type { Command, CommandContext } from './types'

const hasBoard = (c: CommandContext) => c.state.board !== undefined
const playing = (c: CommandContext) => c.state.scenario !== undefined
const selected = (c: CommandContext) => (c.state.selection && c.state.selection.type !== 'board' ? c.state.selection : undefined)

/** Selected things the user made, which the user may delete. The agent's parts and connections are not among them. */
const deletable = (c: CommandContext) => {
  const s = selected(c)
  return s && (s.type === 'link' || s.type === 'mark' || s.type === 'proposal') ? s : undefined
}

function bounds(rects: readonly (Rect | undefined)[]): Rect | undefined {
  const all = rects.filter((r): r is Rect => r !== undefined)
  if (all.length === 0) return undefined
  const x = Math.min(...all.map((r) => r.x))
  const y = Math.min(...all.map((r) => r.y))
  return { x, y, width: Math.max(...all.map((r) => r.x + r.width)) - x, height: Math.max(...all.map((r) => r.y + r.height)) - y }
}

/** The box around the selection on the map: a part, or both ends of a connection or link. */
function selectionBox(c: CommandContext): Rect | undefined {
  const s = selected(c)
  const { board, layer } = c.state
  if (!s || !board || !c.camera) return undefined
  const at = c.camera.rectOf
  if (s.type === 'component') return at(s.id)
  if (s.type === 'relationship') {
    const r = board.relationships.find((x) => x.id === s.id)
    return r ? bounds([at(r.from), at(r.to)]) : undefined
  }
  if (s.type === 'link') {
    const l = layer?.links.find((x) => x.id === s.id)
    return l ? bounds([at(l.from), at(l.to)]) : undefined
  }
  if (s.type === 'proposal') {
    const p = layer?.proposals.find((x) => x.id === s.id)
    return p ? { x: p.x, y: p.y, width: p.width, height: p.height } : undefined
  }
  return undefined
}

const theme = (mode: ThemeMode, label: string, icon: Command['icon']): Command => ({
  id: `theme.${mode}`,
  group: 'Theme',
  label: `Theme: ${label}`,
  icon,
  keywords: ['appearance', 'mode'],
  checked: () => getThemeMode() === mode,
  run: () => setThemeMode(mode),
})

/** Every command with a fixed name. Toolbar buttons, tooltips, the menu, and the keys all read this one list. */
export const COMMANDS: readonly Command[] = [
  {
    id: 'menu',
    group: 'Help',
    label: 'Command menu',
    icon: Search,
    keys: ['Mod+K'],
    unlisted: true,
    inFields: true,
    run: (c) => c.uiApi.setMenuOpen(!c.ui.menuOpen),
  },
  {
    id: 'undo',
    group: 'Board',
    label: 'Undo',
    icon: Undo2,
    keys: ['Mod+Z'],
    visible: hasBoard,
    enabled: (c) => c.state.history.past.length > 0,
    run: (c) => c.dispatch({ type: 'undo' }),
  },
  {
    id: 'redo',
    group: 'Board',
    label: 'Redo',
    icon: Redo2,
    keys: ['Mod+Shift+Z', 'Ctrl+Y'],
    visible: hasBoard,
    enabled: (c) => c.state.history.future.length > 0,
    run: (c) => c.dispatch({ type: 'redo' }),
  },
  {
    id: 'open.folder',
    group: 'Board',
    label: 'Open folder',
    icon: FolderOpen,
    keys: ['Mod+O'],
    keywords: ['repository'],
    visible: (c) => c.workspace.canOpenFolder,
    run: (c) => c.workspace.openFolder(),
  },
  {
    id: 'open.file',
    group: 'Board',
    label: 'Open file',
    icon: FileUp,
    run: (c) => c.shell.openFile(),
  },
  {
    id: 'copy.prompt',
    group: 'Board',
    label: 'Copy prompt',
    icon: Copy,
    keywords: ['agent'],
    visible: (c) => c.workspace.folder !== undefined && c.workspace.folder.state !== 'reopen',
    run: (c) => c.shell.copyPrompt(),
  },
  {
    id: 'download',
    group: 'Board',
    label: 'Download a copy',
    icon: Download,
    keywords: ['export', 'save'],
    visible: hasBoard,
    run: (c) => c.workspace.exportNow(),
  },
  {
    id: 'goto.overview',
    group: 'Go to',
    label: 'Overview',
    icon: ArrowLeft,
    keys: ['Escape'],
    visible: hasBoard,
    enabled: (c) => !playing(c) && selected(c) !== undefined,
    run: (c) => c.shell.toOverview(),
  },
  {
    id: 'goto.review',
    group: 'Go to',
    label: 'Review',
    icon: Inbox,
    visible: (c) => reviewCounts(c.state.board, c.state.layer, c.state.changes).total > 0,
    run: (c) => {
      c.uiApi.setSidebarOpen(true)
      c.uiApi.setTab('review')
    },
  },
  {
    id: 'walkthrough.next',
    group: 'Walkthrough',
    label: 'Next step',
    icon: ChevronRight,
    keys: ['ArrowRight'],
    visible: playing,
    run: (c) => c.dispatch({ type: 'scenarioNext' }),
  },
  {
    id: 'walkthrough.previous',
    group: 'Walkthrough',
    label: 'Previous step',
    icon: ChevronLeft,
    keys: ['ArrowLeft'],
    visible: playing,
    run: (c) => c.dispatch({ type: 'scenarioPrevious' }),
  },
  {
    id: 'walkthrough.close',
    group: 'Walkthrough',
    label: 'Close walkthrough',
    icon: X,
    keys: ['Escape'],
    visible: playing,
    run: (c) => c.shell.closeWalkthrough(),
  },
  {
    id: 'note.add',
    group: 'Selection',
    label: 'Add note',
    icon: StickyNote,
    keys: ['C'],
    keywords: ['question', 'comment'],
    visible: hasBoard,
    run: (c) => {
      c.uiApi.setSidebarOpen(true)
      c.uiApi.setTab('details')
      c.uiApi.askComposer()
    },
  },
  {
    id: 'link.add',
    group: 'Selection',
    label: 'Add link',
    icon: Link2,
    keys: ['L'],
    visible: (c) => {
      const s = selected(c)
      return s?.type === 'component' || s?.type === 'proposal'
    },
    run: (c) => {
      c.uiApi.setSidebarOpen(true)
      c.uiApi.setTab('details')
      c.uiApi.askLinkPicker()
    },
  },
  {
    id: 'selection.delete',
    group: 'Selection',
    label: 'Delete',
    icon: Trash2,
    keys: ['Backspace', 'Delete'],
    visible: (c) => deletable(c) !== undefined,
    run: (c) => {
      const s = deletable(c)
      if (!s) return
      if (s.type === 'link') c.dispatch({ type: 'linkDeleted', id: s.id })
      else if (s.type === 'mark') c.dispatch({ type: 'markDeleted', id: s.id })
      else c.dispatch({ type: 'proposalDeleted', id: s.id })
      deletedToast(s.type === 'link' ? 'Link deleted' : s.type === 'mark' ? 'Mark deleted' : 'Part deleted', c.dispatch)
    },
  },
  {
    id: 'sidebar.toggle',
    group: 'View',
    label: 'Show or hide sidebar',
    icon: PanelRight,
    keys: [']'],
    keywords: ['panel', 'details'],
    visible: hasBoard,
    run: (c) => c.uiApi.toggleSidebar(),
  },
  {
    id: 'zoom.fit',
    group: 'View',
    label: 'Fit board',
    icon: Maximize,
    keys: ['Shift+Digit1'],
    visible: hasBoard,
    run: (c) => c.camera?.zoom('fit'),
  },
  {
    id: 'zoom.selection',
    group: 'View',
    label: 'Zoom to selection',
    icon: Scan,
    keys: ['Shift+Digit2'],
    visible: (c) => selected(c) !== undefined,
    run: (c) => {
      const box = selectionBox(c)
      if (box) c.camera?.frame({ box, padding: 0.25, maxZoom: 1 })
    },
  },
  {
    id: 'zoom.reset',
    group: 'View',
    label: 'Zoom to 100%',
    icon: Search,
    keys: ['Shift+Digit0', 'Mod+0'],
    visible: hasBoard,
    run: (c) => c.camera?.zoom('reset'),
  },
  {
    id: 'zoom.in',
    group: 'View',
    label: 'Zoom in',
    icon: Plus,
    keys: ['+', 'Mod+='],
    visible: hasBoard,
    run: (c) => c.camera?.zoom('in'),
  },
  {
    id: 'zoom.out',
    group: 'View',
    label: 'Zoom out',
    icon: Minus,
    keys: ['-', 'Mod+-'],
    visible: hasBoard,
    run: (c) => c.camera?.zoom('out'),
  },
  {
    id: 'linekey',
    group: 'View',
    label: 'Line key',
    icon: Spline,
    keywords: ['legend'],
    visible: hasBoard,
    run: (c) => c.uiApi.setLineKeyOpen(true),
  },
  theme('system', 'System', Monitor),
  theme('light', 'Light', Sun),
  theme('dark', 'Dark', Moon),
  {
    id: 'howto',
    group: 'Help',
    label: 'How to make a board',
    icon: BookOpen,
    keywords: ['guide', 'schema', 'prompt'],
    run: (c) => c.uiApi.setHowToOpen(true),
  },
]

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]))

export function commandById(id: string): Command {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`No command named ${id}`)
  return found
}

/**
 * Commands made from what is open: one per example and per walkthrough, and, while the user types,
 * one per part and connection under Go to.
 */
export function boardCommands(c: CommandContext): Command[] {
  const { board } = c.state
  const out: Command[] = EXAMPLES.map((example) => ({
    id: `example.${example.id}`,
    group: 'Board',
    label: `Open example: ${example.title}`,
    icon: BookOpen,
    run: (ctx) => ctx.workspace.openText(example.fileName, example.raw, 'example'),
  }))
  if (!board) return out
  for (const scenario of board.scenarios) {
    out.push({ id: `play.${scenario.id}`, group: 'Walkthrough', label: `Play: ${scenario.title}`, icon: Play, run: (ctx) => ctx.shell.playWalkthrough(scenario.id) })
  }
  const names = new Map(board.components.map((p) => [p.id, p.label]))
  for (const part of board.components) {
    out.push({
      id: `goto.part.${part.id}`,
      group: 'Go to',
      label: part.label,
      icon: ArrowRight,
      searchOnly: true,
      run: (ctx) => ctx.dispatch({ type: 'select', selection: { type: 'component', id: part.id } }),
    })
  }
  for (const r of board.relationships) {
    out.push({
      id: `goto.connection.${r.id}`,
      group: 'Go to',
      label: `${r.label}: ${names.get(r.from) ?? r.from} to ${names.get(r.to) ?? r.to}`,
      icon: Spline,
      searchOnly: true,
      run: (ctx) => ctx.dispatch({ type: 'select', selection: { type: 'relationship', id: r.id } }),
    })
  }
  return out
}

export const isVisible = (command: Command, c: CommandContext) => command.visible?.(c) ?? true
export const isEnabled = (command: Command, c: CommandContext) => isVisible(command, c) && (command.enabled?.(c) ?? true)
