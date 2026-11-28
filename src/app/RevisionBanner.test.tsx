import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useEffect } from 'react'
import type { Board } from '../board/schema'
import { clone, refundBoard } from '../layer/testBoards'
import { Shellless } from '../test/Shellless'
import { RevisionBanner } from './RevisionBanner'
import { AppStoreContext, createAppStore, type AppStoreApi } from './store'
import { useTabTitle } from './tabTitle'
import { useUiApi, type UiApi } from './ui'

const now = new Date('2026-11-28T10:00:00.000Z')

function revised(board: Board): Board {
  const next = clone(board)
  next.revision += 1
  next.components[0]!.summary = 'A new summary.'
  next.components.push({ ...clone(next.components[1]!), id: 'brand-new', label: 'Brand new' })
  return next
}

let ui: UiApi
function Spy() {
  const api = useUiApi()
  useEffect(() => {
    ui = api
  })
  return null
}

function mount(store: AppStoreApi) {
  return render(
    <AppStoreContext.Provider value={store}>
      <Shellless>
        <Spy />
        <RevisionBanner />
        <TabTitle />
      </Shellless>
    </AppStoreContext.Provider>,
  )
}

function TabTitle() {
  useTabTitle()
  return null
}

function arrived() {
  const store = createAppStore()
  const board = refundBoard()
  store.dispatch({ type: 'boardOpened', board, warnings: [], now })
  store.dispatch({ type: 'boardOpened', board: revised(board), warnings: [], previous: board, now })
  return store
}

describe('the revision banner', () => {
  beforeEach(() => {
    document.title = 'Anatomy'
  })
  afterEach(() => {
    document.title = 'Anatomy'
  })

  it('says what arrived, with a way to review it, and stays until the user acts', () => {
    const store = arrived()
    mount(store)
    const banner = screen.getByRole('status', { name: 'Revision update' })
    expect(banner).toHaveTextContent('Revision 2: 1 new part, 1 changed part.')
    expect(within(banner).getByRole('button', { name: 'Review' })).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    act(() => void store.dispatch({ type: 'select', selection: { type: 'board' } }))
    expect(screen.getByRole('status', { name: 'Revision update' })).toBeInTheDocument()
  })

  it('opens the Review tab on the map, and goes', () => {
    const store = arrived()
    mount(store)
    act(() => {
      ui.setTab('details')
      ui.setSidebarOpen(false)
      ui.setViewState('map')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(ui.store.getState().tab).toBe('review')
    expect(ui.store.getState().sidebar.open).toBe(true)
    expect(screen.queryByRole('status', { name: 'Revision update' })).not.toBeInTheDocument()
    // The changes themselves stay until they are marked reviewed.
    expect(store.store.getState().changes).toBeDefined()
  })

  it('goes with Dismiss and leaves the Review tab as it was', () => {
    const store = arrived()
    mount(store)
    act(() => ui.setTab('details'))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status', { name: 'Revision update' })).not.toBeInTheDocument()
    expect(ui.store.getState().tab).toBe('details')
  })

  it('stays away from the Overview, which says the same in Needs you', () => {
    const store = arrived()
    mount(store)
    act(() => ui.setViewState('overview'))
    expect(screen.queryByRole('status', { name: 'Revision update' })).not.toBeInTheDocument()
    act(() => ui.setViewState('map'))
    expect(screen.getByRole('status', { name: 'Revision update' })).toBeInTheDocument()
  })

  it('puts the count in the title of the tab while it waits', () => {
    const store = arrived()
    mount(store)
    expect(document.title).toBe('(2) Anatomy')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(document.title).toBe('Anatomy')
  })

  it('says a file that could not be opened left the board as it was', () => {
    const store = createAppStore()
    store.dispatch({ type: 'boardOpened', board: refundBoard(), warnings: [], now })
    mount(store)
    expect(screen.queryByRole('status', { name: 'Board file problem' })).not.toBeInTheDocument()
    act(() => store.dispatch({ type: 'boardProblem', problem: { kind: 'invalid', count: 3, first: 'components.0.label: is required' } }))
    const note = screen.getByRole('status', { name: 'Board file problem' })
    expect(note).toHaveTextContent('board.json has 3 problems, so revision 1 stays open.')
    expect(note).toHaveTextContent('components.0.label: is required')
    act(() => store.dispatch({ type: 'boardProblem', problem: { kind: 'invalid', count: 1, first: 'goal: is required' } }))
    expect(screen.getByRole('status', { name: 'Board file problem' })).toHaveTextContent('board.json has 1 problem, so revision 1 stays open.')
    fireEvent.click(within(screen.getByRole('status', { name: 'Board file problem' })).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status', { name: 'Board file problem' })).not.toBeInTheDocument()
  })

  it('says why a revision that did not rise was not opened', () => {
    const store = createAppStore()
    store.dispatch({ type: 'boardOpened', board: { ...refundBoard(), revision: 4 }, warnings: [], now })
    mount(store)
    act(() => store.dispatch({ type: 'boardProblem', problem: { kind: 'not-rising', found: 4 } }))
    expect(screen.getByRole('status', { name: 'Board file problem' })).toHaveTextContent('board.json changed but is still revision 4. A new revision needs a higher number.')
    act(() => store.dispatch({ type: 'boardProblem', problem: { kind: 'not-rising', found: 2 } }))
    expect(screen.getByRole('status', { name: 'Board file problem' })).toHaveTextContent('board.json is at revision 2, lower than the open revision 4, so revision 4 stays open.')
  })
})
