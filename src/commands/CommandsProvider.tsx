import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useAppDispatch, useAppStoreApi } from '../app/store'
import { useUiApi } from '../app/ui'
import { useWorkspace } from '../app/workspaceContext'
import { CameraSlotContext } from '../canvas/cameraContext'
import { CommandsContext } from './context'
import { editsText, isSingleKey, matches } from './keys'
import { COMMANDS, isEnabled } from './list'
import type { Command, CommandContext, ShellActions } from './types'

/** Focus in one of these keeps its own keys: Escape closes it, and letters type. */
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      const target = event.target as Element | null
      const inField = editsText(target)
      const inOwn = target instanceof Element && target.closest(OWN_KEYS) !== null
      const ctx = context()
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

