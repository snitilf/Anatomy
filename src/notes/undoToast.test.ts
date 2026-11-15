import { expect, it, vi } from 'vitest'
import { createAppStore } from '../app/store'
import { deletedToast } from './undoToast'

const { action, dismiss } = vi.hoisted(() => ({ action: { click: () => {} }, dismiss: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign((_message: string, options: { action: { onClick: () => void } }) => {
  action.click = options.action.onClick
  return 1
}, { dismiss }) }))

it('dismisses a deletion undo when a later history entry appears', () => {
  const { store, dispatch } = createAppStore()
  const send = vi.fn(dispatch)
  deletedToast('Deleted', send, store)
  store.setState({ history: { past: [], future: [] } })
  expect(dismiss).toHaveBeenCalledWith(1)
  action.click()
  expect(send).not.toHaveBeenCalled()
})
