import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exampleBoard } from '../layer/testBoards'
import { SaveStatus } from './SaveStatus'
import { AppStoreContext, createAppStore } from './store'
import { WorkspaceContext, type SaveState, type WorkspaceApi } from './workspaceContext'
import { useContext } from 'react'

function Harness({ save }: { save: SaveState }) {
  const base = useContext(WorkspaceContext)
  const api: WorkspaceApi = { ...base, save }
  return (
    <WorkspaceContext.Provider value={api}>
      <SaveStatus />
    </WorkspaceContext.Provider>
  )
}

function app() {
  const store = createAppStore()
  store.dispatch({ type: 'boardOpened', board: exampleBoard(), warnings: [] })
  return (s: SaveState) => (
    <AppStoreContext.Provider value={store}>
      <Harness save={s} />
    </AppStoreContext.Provider>
  )
}

describe('the save status', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('says nothing when saved, and only says Saving once a write takes a second', () => {
    const tree = app()
    const view = render(tree({ kind: 'saved', where: 'browser' }))
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent('')
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()

    // A write begins and is still pending.
    view.rerender(tree({ kind: 'saving' }))
    act(() => void vi.advanceTimersByTime(999))
    expect(screen.getByRole('status')).toHaveTextContent('')
    act(() => void vi.advanceTimersByTime(1))
    expect(screen.getByRole('status')).toHaveTextContent('Saving')
    // The same live region stays mounted, so the text is announced as it arrives.
    expect(screen.getByRole('status')).toBe(region)

    // The write resolves.
    view.rerender(tree({ kind: 'saved', where: 'browser' }))
    expect(screen.getByRole('status')).toHaveTextContent('')
    expect(screen.queryByText('Saving')).not.toBeInTheDocument()
  })

  it('leaves no timer behind when it unmounts during a write', () => {
    const tree = app()
    const view = render(tree({ kind: 'saving' }))
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
