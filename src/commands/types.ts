import type { LucideIcon } from 'lucide-react'
import type { AppState } from '../app/state'
import type { Dispatch } from '../app/store'
import type { UiApi, UiState } from '../app/ui'
import type { WorkspaceApi } from '../app/workspaceContext'
import type { Camera } from '../canvas/cameraContext'
import type { Keys } from './keys'

/** What the shell does itself, because it moves focus or opens a native picker. */
export interface ShellActions {
  openFile(): void
  /** Back to the board overview. Focus returns to the map element that had it. */
  toOverview(): void
  /** Focus returns to whatever started the walkthrough. */
  closeWalkthrough(): void
  playWalkthrough(id: string): void
  copyPrompt(): void
}

/** Everything a command may read or do. `state` and `ui` are the latest, read when the command is asked. */
export interface CommandContext {
  state: AppState
  ui: UiState
  dispatch: Dispatch
  uiApi: UiApi
  workspace: WorkspaceApi
  shell: ShellActions
  camera: Camera | undefined
}

export type Group = 'Board' | 'Go to' | 'Walkthrough' | 'Selection' | 'Tools' | 'View' | 'Theme' | 'Help'

export const GROUP_ORDER: readonly Group[] = ['Board', 'Go to', 'Walkthrough', 'Selection', 'Tools', 'View', 'Theme', 'Help']

export interface Command {
  id: string
  group: Group
  label: string
  /** The label under the heading that names the selection, where the selection is already said. */
  contextLabel?: string
  icon: LucideIcon
  /** The first is shown in tooltips and in the menu. Every one of them runs the command. */
  keys?: readonly Keys[]
  /** Other words that find it in the menu. */
  keywords?: readonly string[]
  /** Hidden commands still answer their keys, but the menu does not list them. */
  visible?(ctx: CommandContext): boolean
  enabled?(ctx: CommandContext): boolean
  /** A check in the menu, such as the theme in use. */
  checked?(ctx: CommandContext): boolean
  /** Not listed in the menu at all, such as the key that opens the menu. */
  unlisted?: boolean
  /** Listed only once something is typed, such as every part of the board. */
  searchOnly?: boolean
  /** The keys work in a text field too. */
  inFields?: boolean
  run(ctx: CommandContext): void
}
