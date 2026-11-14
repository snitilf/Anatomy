import { createContext, useContext } from 'react'
import { useAppStore } from '../app/store'
import { useUi } from '../app/ui'
import { useWorkspace } from '../app/workspaceContext'
import { useThemeMode } from '../theme/theme'
import { formatKeys } from './keys'
import { commandById, isEnabled, isVisible } from './list'
import type { Command, CommandContext } from './types'

export interface CommandsApi {
  /** The context as it is now. Commands read it when they run. */
  context(): CommandContext
  run(command: Command): void
}

export const CommandsContext = createContext<CommandsApi | undefined>(undefined)

export function useCommands(): CommandsApi {
  const api = useContext(CommandsContext)
  if (!api) throw new Error('Commands are missing. Wrap the tree in CommandsProvider.')
  return api
}

export interface CommandView {
  command: Command
  label: string
  visible: boolean
  enabled: boolean
  checked: boolean
  /** The first shortcut, printed for this platform. */
  shortcut: string | undefined
  run(): void
}

/** One command, ready for a button: its label, its state, its shortcut, and a way to run it. */
export function useCommand(id: string): CommandView {
  const command = commandById(id)
  const { context, run } = useCommands()
  const workspace = useWorkspace()
  // The theme lives outside both stores, so a change of it has to render the buttons that show it.
  useThemeMode()
  const state = useAppStore((s) => {
    const ctx = { ...context(), state: s, workspace }
    return `${isVisible(command, ctx) ? 1 : 0}${isEnabled(command, ctx) ? 1 : 0}${command.checked?.(ctx) ? 1 : 0}`
  })
  // UI state counts too, such as whether the sidebar is open.
  useUi((u) => {
    const ctx = { ...context(), ui: u, workspace }
    return `${isVisible(command, ctx) ? 1 : 0}${isEnabled(command, ctx) ? 1 : 0}`
  })
  const first = command.keys?.[0]
  return {
    command,
    label: command.label,
    visible: state[0] === '1',
    enabled: state[1] === '1',
    checked: state[2] === '1',
    shortcut: first ? formatKeys(first) : undefined,
    run: () => run(command),
  }
}
