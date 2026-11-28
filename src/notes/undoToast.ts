import { toast } from 'sonner'
import type { AppStore, Dispatch } from '../app/store'

/**
 * A delete happens at once. The toast offers the way back. With the store, it closes once history moves on, so its Undo
 * never reaches a step before the one it names. `onUndo` runs just before its undo.
 */
export function deletedToast(message: string, dispatch: Dispatch, store?: AppStore, onUndo?: () => void) {
  const history = store?.getState().history
  let unsubscribe = () => {}
  const id = toast(message, {
    action: { label: 'Undo', onClick: () => {
      if (!store || store.getState().history === history) {
        onUndo?.()
        dispatch({ type: 'undo' })
      }
      unsubscribe()
    } },
    onDismiss: () => unsubscribe(),
    onAutoClose: () => unsubscribe(),
  })
  if (store) unsubscribe = store.subscribe((state) => {
    if (state.history !== history) {
      toast.dismiss(id)
      unsubscribe()
    }
  })
}
