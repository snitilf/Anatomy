import { trailOf } from '../app/crumbs'
import type { CommandContext } from './types'

/** The commands about the selected part or line, in the order the menu lists them under its name. */
export const SELECTION_COMMANDS = ['zoom.bundle', 'note.add', 'link.add', 'zoom.selection', 'selection.overview', 'selection.copyName', 'walk.target', 'walk.source', 'walk.next', 'walk.previous'] as const

/** The name of the selected part or line while the map is in front, which heads the menu's first group. */
export function selectionName(ctx: CommandContext): string | undefined {
  const { board, layer, selection } = ctx.state
  return board && ctx.ui.view === 'map' && !ctx.state.scenario ? trailOf(board, layer, selection)?.last.label : undefined
}

