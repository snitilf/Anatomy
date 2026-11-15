import { toast } from 'sonner'
import type { AppStore, Dispatch } from '../app/store'

/** A delete happens at once. The toast offers the way back. */
export function deletedToast(message: string, dispatch: Dispatch, store?: AppStore) {
  const history = store?.getState().history
  let unsubscribe = () => {}
  const id = toast(message, {
    action: { label: 'Undo', onClick: () => {
      if (!store || store.getState().history === history) dispatch({ type: 'undo' })
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
