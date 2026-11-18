import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useAppDispatch, useAppStoreApi } from '../app/store'
import { useUiApi } from '../app/ui'
import { useWorkspace } from '../app/workspaceContext'
import { CameraSlotContext } from '../canvas/cameraContext'
import { CommandsContext } from './context'
import { editsText, isSingleKey, matches, sequenceOf, stepSequence, type Keys } from './keys'
import { COMMANDS, isEnabled } from './list'
import type { Command, CommandContext, ShellActions } from './types'

/** Focus in one of these keeps its own keys: Escape closes it, and letters type. */
/** How long the first key of a sequence waits for the second. */
const SEQUENCE_MS = 1200

/** Every sequence the commands answer to. */
const SEQUENCES: readonly (readonly [Keys, Keys])[] = COMMANDS.flatMap((c) => (c.keys ?? []).flatMap((k) => {
  const pair = sequenceOf(k)
  return pair ? [pair] : []
}))

const OWN_KEYS = 'dialog, [role="dialog"], [role="menu"], [role="listbox"], [data-dismissible], [aria-expanded="true"][aria-haspopup]'

/**
 * Builds the context every command reads, and listens for every shortcut with one `keydown` listener.
 * A single key does nothing while a text field, a dialog, a menu, or a popover has focus.
 * Cmd and Ctrl shortcuts leave text fields alone too, so a field's own undo wins, unless the command says otherwise.
 */
export function CommandsProvider({ shell, children }: { shell: ShellActions; children: ReactNode }) {
  const store = useAppStoreApi()
  const dispatch = useAppDispatch()
  const uiApi = useUiApi()
  const workspace = useWorkspace()
  const camera = useContext(CameraSlotContext)
  const latest = useRef({ workspace, shell })
  useLayoutEffect(() => {
    latest.current = { workspace, shell }
  })

  const context = useCallback(
    (): CommandContext => ({
      state: store.getState(),
      ui: uiApi.store.getState(),
      dispatch,
      uiApi,
      workspace: latest.current.workspace,
      shell: latest.current.shell,
      camera: camera.get(),
    }),
    [store, dispatch, uiApi, camera],
  )

  const run = useCallback(
    (command: Command) => {
      const ctx = context()
      if (isEnabled(command, ctx)) command.run(ctx)
    },
    [context],
  )

  // The first key of a sequence such as G then O, and when it was typed.
  const armed = useRef<{ key: string; at: number } | undefined>(undefined)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      const target = event.target as Element | null
      const inField = editsText(target)
      const inOwn = target instanceof Element && target.closest(OWN_KEYS) !== null
      const ctx = context()
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return
      const waiting = armed.current
      armed.current = undefined
      const plain = !event.metaKey && !event.ctrlKey && !event.altKey
      if (plain && !inField && !inOwn && event.key.length === 1 && ctx.state.board) {
        const waited = waiting && Date.now() - waiting.at < SEQUENCE_MS ? waiting.key : undefined
        const step = stepSequence(waited, event.key.toLowerCase(), SEQUENCES)
        if (step.action !== 'pass') {
          event.preventDefault()
          event.stopPropagation()
          if (step.action === 'arm') armed.current = { key: step.key, at: Date.now() }
          else if (step.action === 'run') {
            // A sequence whose view is already in front does nothing.
            const command = COMMANDS.find((c) => c.keys?.includes(step.sequence.join(' ')) && isEnabled(c, ctx))
            command?.run(ctx)
          }
          return
        }
      }
      for (const command of COMMANDS) {
        const keys = command.keys?.find((k) => matches(k, event))
        if (!keys) continue
        if (inField && !command.inFields) continue
        if (inOwn && !command.inFields && (isSingleKey(keys) || target?.closest('dialog, [role="dialog"]'))) continue
        if (!isEnabled(command, ctx)) continue
        event.preventDefault()
        // The map must not also act on the key, such as an arrow key that would move the focused card.
        event.stopPropagation()
        command.run(ctx)
        return
      }
    }
    // Capture on the document: after the map's own capture on the window, which takes Escape while a card is held,
    // and before a focused card, which would move on an arrow key.
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [context])

  const api = useMemo(() => ({ context, run }), [context, run])
  return <CommandsContext.Provider value={api}>{children}</CommandsContext.Provider>
}

