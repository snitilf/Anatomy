import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Download,
  FileUp,
  FolderOpen,
  Hand,
  Inbox,
  LayoutList,
  ListFilter,
  Link2,
  Map as MapIcon,
  Maximize,
  Minus,
  Monitor,
  Moon,
  MousePointer2,
  MoveUpRight,
  PanelRight,
  Pen,
  Play,
  Plus,
  Redo2,
  Scan,
  Search,
  Send,
  Spline,
  Square,
  SquarePlus,
  StickyNote,
  Sun,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react'
import { EXAMPLES, openExample } from '../app/examples'
import type { Selection } from '../app/state'
import { copyText } from '../app/clipboard'
import { trailOf } from '../app/crumbs'
import { blockRect, boundsOf, frameBundle } from '../canvas/bundleFrame'
import { showView } from '../app/viewActions'
import { overviewMemory, revealRow } from '../overview/memory'
import { setThemeMode, getThemeMode, type ThemeMode } from '../theme/theme'
import { reviewCounts } from '../notes/review'
import { toast } from 'sonner'
import { currentTrail, rememberStep, walkStep, type Walk } from './walk'
import { deletedToast } from '../notes/undoToast'
import type { Rect } from '../layout/geometry'
import type { Tool } from '../whiteboard/tools'
import type { Command, CommandContext } from './types'

const hasBoard = (c: CommandContext) => c.state.board !== undefined
/** A part or a line is selected, so it has a name and a place on the map. */
const onTrail = (c: CommandContext) => c.state.board !== undefined && trailOf(c.state.board, c.state.layer, c.state.selection) !== undefined
const playing = (c: CommandContext) => c.state.scenario !== undefined
/** The map is the view in front: the Overview page covers it and takes its own keys. */
const onMap = (c: CommandContext) => c.ui.view === 'map'
const selected = (c: CommandContext) => (c.state.selection && c.state.selection.type !== 'board' ? c.state.selection : undefined)

/** Selected things the user made, which the user may delete. The agent's parts and connections are not among them. */
const deletable = (c: CommandContext) => {
  const s = selected(c)
  return s && (s.type === 'link' || s.type === 'mark' || s.type === 'proposal') ? s : undefined
}

/** The box around the selection on the map: a part, or both ends of a connection or link. */
function selectionBox(c: CommandContext): Rect | undefined {
  const s = selected(c)
  const { board, layer } = c.state
  if (!s || !board || !c.camera) return undefined
  const at = c.camera.rectOf
  if (s.type === 'component') return at(s.id)
  if (s.type === 'bundle') return boundsOf([blockRect(board, at, s.a), blockRect(board, at, s.b)])
  if (s.type === 'relationship') {
    const r = board.relationships.find((x) => x.id === s.id)
    return r ? boundsOf([at(r.from), at(r.to)]) : undefined
  }
  if (s.type === 'link') {
    const l = layer?.links.find((x) => x.id === s.id)
    return l ? boundsOf([at(l.from), at(l.to)]) : undefined
  }
  if (s.type === 'proposal') {
    const p = layer?.proposals.find((x) => x.id === s.id)
    return p ? { x: p.x, y: p.y, width: p.width, height: p.height } : undefined
  }
  return undefined
}

/** The part that has focus in the Overview's list, as a selection. */
function overviewRow(): Selection | undefined {
  const row = document.activeElement?.closest<HTMLElement>('[data-row][data-type]')
  const { type, id } = row?.dataset ?? {}
  return id && (type === 'component' || type === 'proposal') ? { type, id } : undefined
}


/** A step along the graph from the selected part or line, as a command. It is on when there is somewhere to go. */
const walk = (move: Walk, id: string, label: string, icon: Command['icon'], key: string, keywords: readonly string[]): Command => ({
  id: `walk.${id}`,
  group: 'Selection',
  label,
  icon,
  keys: [key],
  keywords: ['walk', 'follow', ...keywords],
  visible: (c) => onMap(c) && !playing(c) && onTrail(c),
  // The key is always taken while a part or line is selected, so a step with nowhere to go never reaches the browser (Alt+arrow is Back and Forward on Windows and Linux). It does nothing, in silence.
  available: (c) => !!c.state.board && walkStep(c.state.board, c.state.layer, c.state.selection, currentTrail(), move) !== undefined,
  run: (c) => {
    const step = c.state.board && walkStep(c.state.board, c.state.layer, c.state.selection, currentTrail(), move)
    if (!step) return
    rememberStep(step)
    c.dispatch({ type: 'select', selection: step.selection })
  },
})

const theme = (mode: ThemeMode, label: string, icon: Command['icon']): Command => ({
  id: `theme.${mode}`,
  group: 'Theme',
  label: `Theme: ${label}`,
  icon,
  keywords: ['appearance', 'mode'],
  checked: () => getThemeMode() === mode,
  run: () => setThemeMode(mode),
})

const tool = (id: Tool, label: string, icon: Command['icon'], key: string, keywords: readonly string[] = []): Command => ({
  id: `tool.${id}`,
  group: 'Tools',
  label,
  icon,
  keys: [key],
  keywords: ['whiteboard', 'draw', ...keywords],
  visible: (c) => hasBoard(c) && !playing(c) && onMap(c),
  checked: (c) => c.ui.tool === id,
  run: (c) => {
    c.uiApi.setEditing(undefined)
    c.uiApi.setTool(id)
  },
})

/** The whiteboard tools, in tool bar order. */
export const TOOLS: readonly Command[] = [
  tool('select', 'Select', MousePointer2, 'V', ['move', 'pointer']),
  tool('hand', 'Hand', Hand, 'H', ['pan']),
  tool('pen', 'Pen', Pen, 'P', ['drawing', 'freehand']),
  tool('rect', 'Rectangle', Square, 'R', ['shape', 'box']),
  tool('ellipse', 'Ellipse', Circle, 'O', ['shape', 'circle']),
  tool('arrow', 'Arrow', MoveUpRight, 'A', ['line', 'connector']),
  tool('text', 'Text', Type, 'T', ['label', 'write']),
  tool('sticky', 'Sticky note', StickyNote, 'S', ['note', 'post-it']),
  tool('part', 'New part', SquarePlus, 'N', ['proposal', 'component', 'card']),
]

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
    id: 'send',
    group: 'Board',
    label: 'Send to agent',
    icon: Send,
    keys: ['Mod+Enter'],
    keywords: ['feedback', 'export', 'prompt'],
    visible: hasBoard,
    run: (c) => {
      c.uiApi.setMenuOpen(false)
      c.uiApi.setSendOpen(true)
    },
  },
  {
    id: 'undo',
    group: 'Board',
    label: 'Undo',
    icon: Undo2,
    keys: ['Mod+Z'],
    visible: (c) => hasBoard(c) && onMap(c),
    enabled: (c) => c.state.history.past.length > 0,
    run: (c) => c.dispatch({ type: 'undo' }),
  },
  {
    id: 'redo',
    group: 'Board',
    label: 'Redo',
    icon: Redo2,
    keys: ['Mod+Shift+Z', 'Ctrl+Y'],
    visible: (c) => hasBoard(c) && onMap(c),
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
    // Escape leaves a whiteboard tool before it leaves the selection.
    id: 'tool.cancel',
    group: 'Tools',
    label: 'Back to Select',
    icon: MousePointer2,
    keys: ['Escape'],
    unlisted: true,
    enabled: (c) => c.ui.tool !== 'select',
    run: (c) => {
      c.uiApi.setEditing(undefined)
      c.uiApi.setTool('select')
    },
  },
  {
    id: 'goto.overview',
    group: 'Go to',
    label: 'Board',
    icon: ArrowLeft,
    keys: ['Escape'],
    visible: (c) => hasBoard(c) && onMap(c),
    enabled: (c) => !playing(c) && selected(c) !== undefined,
    run: (c) => c.shell.toOverview(),
  },
  {
    id: 'view.overview',
    group: 'Go to',
    label: 'Go to Overview',
    icon: LayoutList,
    keys: ['G O'],
    keywords: ['parts', 'list', 'page'],
    visible: (c) => hasBoard(c) && !playing(c) && c.ui.view !== 'overview',
    run: (c) => showView(c.uiApi, c.state.board?.id, 'overview'),
  },
  {
    id: 'overview.filter',
    group: 'View',
    label: 'Filter parts',
    icon: ListFilter,
    keys: ['/'],
    visible: (c) => hasBoard(c) && c.ui.view === 'overview',
    run: () => document.querySelector<HTMLInputElement>('[data-overview-filter]')?.focus(),
  },
  {
    id: 'view.map',
    group: 'Go to',
    label: 'Go to Map',
    icon: MapIcon,
    keys: ['G M'],
    keywords: ['canvas', 'board'],
    visible: (c) => hasBoard(c) && c.ui.view !== 'map',
    run: (c) => showView(c.uiApi, c.state.board?.id, 'map'),
  },
  {
    id: 'goto.review',
    group: 'Go to',
    label: 'Review',
    icon: Inbox,
    visible: (c) => reviewCounts(c.state.board, c.state.layer, c.state.changes).total > 0,
    run: (c) => {
      showView(c.uiApi, c.state.board?.id, 'map')
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
    // On the Overview a note belongs to the part under focus, so the key needs a part row.
    enabled: (c) => (onMap(c) && selected(c)?.type !== 'bundle') || overviewRow() !== undefined,
    run: (c) => {
      const row = c.ui.view === 'overview' ? overviewRow() : undefined
      if (row) {
        c.dispatch({ type: 'select', selection: row })
        showView(c.uiApi, c.state.board?.id, 'map')
      }
      c.uiApi.setSidebarOpen(true)
      c.uiApi.setTab('details')
      // After the map is in front and the note field is there for the part.
      if (row) requestAnimationFrame(() => c.uiApi.askComposer())
      else c.uiApi.askComposer()
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
      return onMap(c) && (s?.type === 'component' || s?.type === 'proposal')
    },
    run: (c) => {
      c.uiApi.setSidebarOpen(true)
      c.uiApi.setTab('details')
      c.uiApi.askLinkPicker()
    },
  },
  {
    id: 'selection.overview',
    group: 'Selection',
    label: 'Show on Overview',
    icon: LayoutList,
    keywords: ['list', 'page', 'parts'],
    visible: (c) => onMap(c) && !playing(c) && onTrail(c),
    run: (c) => {
      const { board, selection } = c.state
      if (!board || !selection || selection.type === 'board') return
      if (selection.type === 'component' || selection.type === 'proposal') {
        const group = selection.type === 'proposal' ? 'yours' : (board.components.find((p) => p.id === selection.id)?.group ?? 'other')
        revealRow(board.id, `part:${selection.id}`, group)
      } else if (selection.type === 'relationship' || selection.type === 'link') revealRow(board.id, `conn:${selection.id}`)
      else if (selection.type === 'bundle') {
        // The pair's row, open, and not folded away behind Show more.
        overviewMemory(board.id).expanded.add('more').add(selection.id)
        revealRow(board.id, `between:${selection.id}`)
      }
      showView(c.uiApi, board.id, 'overview')
    },
  },
  {
    id: 'selection.copyName',
    group: 'Selection',
    label: 'Copy name',
    icon: Copy,
    keywords: ['label', 'title'],
    visible: (c) => onMap(c) && !playing(c) && onTrail(c),
    run: (c) => {
      const name = c.state.board && trailOf(c.state.board, c.state.layer, c.state.selection)?.last.label
      if (name === undefined) return
      void copyText(name).then((ok) => (ok ? toast('Name copied') : toast.error('Could not copy the name')))
    },
  },
  walk('target', 'target', 'Go to target', ArrowRight, 'Alt+ArrowRight', ['next', 'outgoing', 'forward']),
  walk('source', 'source', 'Go to source', ArrowLeft, 'Alt+ArrowLeft', ['previous', 'incoming', 'back']),
  walk('next', 'next', 'Next sibling', ArrowDown, 'Alt+ArrowDown', ['sideways', 'same source']),
  walk('previous', 'previous', 'Previous sibling', ArrowUp, 'Alt+ArrowUp', ['sideways', 'same source']),
  {
    id: 'selection.delete',
    group: 'Selection',
    label: 'Delete',
    icon: Trash2,
    keys: ['Backspace', 'Delete'],
    visible: (c) => onMap(c) && deletable(c) !== undefined,
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
    visible: (c) => hasBoard(c) && onMap(c),
    run: (c) => c.uiApi.toggleSidebar(),
  },
  {
    id: 'zoom.fit',
    group: 'View',
    label: 'Fit board',
    icon: Maximize,
    keys: ['Shift+Digit1'],
    visible: (c) => hasBoard(c) && onMap(c),
    run: (c) => c.camera?.zoom('fit'),
  },
  {
    id: 'zoom.selection',
    group: 'View',
    label: 'Zoom to selection',
    contextLabel: 'Zoom to',
    icon: Scan,
    keys: ['Shift+Digit2'],
    visible: (c) => onMap(c) && selected(c) !== undefined && selected(c)?.type !== 'bundle',
    run: (c) => {
      const box = selectionBox(c)
      if (box) c.camera?.frame({ box, padding: 0.25, maxZoom: 1 })
    },
  },
  {
    id: 'zoom.bundle',
    group: 'View',
    label: 'Zoom to bundle',
    icon: Scan,
    keywords: ['fit', 'ends', 'selection', 'connections'],
    visible: (c) => onMap(c) && !playing(c) && selected(c)?.type === 'bundle',
    run: (c) => {
      const s = selected(c)
      if (c.camera && c.state.board && s?.type === 'bundle') frameBundle(c.camera, c.state.board, s.a, s.b)
    },
  },
  {
    id: 'zoom.reset',
    group: 'View',
    label: 'Zoom to 100%',
    icon: Search,
    keys: ['Shift+Digit0', 'Mod+0'],
    visible: (c) => hasBoard(c) && onMap(c),
    run: (c) => c.camera?.zoom('reset'),
  },
  {
    id: 'zoom.in',
    group: 'View',
    label: 'Zoom in',
    icon: Plus,
    keys: ['+', 'Mod+='],
    visible: (c) => hasBoard(c) && onMap(c),
    run: (c) => c.camera?.zoom('in'),
  },
  {
    id: 'zoom.out',
    group: 'View',
    label: 'Zoom out',
    icon: Minus,
    keys: ['-', 'Mod+-'],
    visible: (c) => hasBoard(c) && onMap(c),
    run: (c) => c.camera?.zoom('out'),
  },
  {
    id: 'linekey',
    group: 'View',
    label: 'Line key',
    icon: Spline,
    keywords: ['legend'],
    visible: (c) => hasBoard(c) && onMap(c),
    run: (c) => c.uiApi.setLineKeyOpen(true),
  },
  ...TOOLS,
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
    run: (ctx) => void openExample(example, (fileName, text) => ctx.workspace.openText(fileName, text, 'example')),
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
/** Whether the menu lists the command: it is visible, and it would do something. Its keys work either way. */
export const isListed = (command: Command, c: CommandContext) => isVisible(command, c) && (command.available?.(c) ?? true)
export const isEnabled = (command: Command, c: CommandContext) => isVisible(command, c) && (command.enabled?.(c) ?? true)
