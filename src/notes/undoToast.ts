import { toast } from 'sonner'
import type { Dispatch } from '../app/store'

/** A delete happens at once. The toast offers the way back. */
export function deletedToast(message: string, dispatch: Dispatch) {
  toast(message, { action: { label: 'Undo', onClick: () => dispatch({ type: 'undo' }) } })
}
