import { act, render } from '@testing-library/react'
import { Profiler } from 'react'
import { describe, expect, it } from 'vitest'
import { NotesSection } from '../inspector/notes'
import { nordetBoard } from '../layer/testBoards'
import { PanelContext } from '../inspector/panelContext'
import { AppStoreContext, createAppStore } from './store'
import { TopBar } from './TopBar'
import { Shellless } from '../test/Shellless'

function opened() {
  const api = createAppStore()
  const board = nordetBoard()
  api.dispatch({ type: 'boardOpened', board, warnings: [] })
  return { api, board }
}

function counted(node: React.ReactNode, api: ReturnType<typeof createAppStore>) {
  const commits = { toolbar: 0, notes: 0 }
  render(
    <AppStoreContext.Provider value={api}>
      <Shellless>
        <PanelContext.Provider value={{ choose: () => {}, headingRef: { current: null } }}>
          <Profiler id="toolbar" onRender={() => commits.toolbar++}>
            <TopBar />
          </Profiler>
          <Profiler id="notes" onRender={() => commits.notes++}>
            {node}
          </Profiler>
        </PanelContext.Provider>
      </Shellless>
    </AppStoreContext.Provider>,
  )
  return commits
}

describe('the app store', () => {
  it('does not render the top bar again when only the selection changes', () => {
    const { api, board } = opened()
    const commits = counted(null, api)
    const before = commits.toolbar
    const id = board.components[0]!.id
    act(() => api.dispatch({ type: 'select', selection: { type: 'component', id } }))
    act(() => api.dispatch({ type: 'select', selection: { type: 'board' } }))
    expect(commits.toolbar).toBe(before)
  })

  it('does not render the top bar or the notes again when a card moves', () => {
    const { api, board } = opened()
    const id = board.components[0]!.id
    const commits = counted(<NotesSection target={{ type: 'component', id }} />, api)
    // The first change turns on Undo. Later moves change nothing the top bar shows.
    act(() => api.dispatch({ type: 'cardsMoved', positions: { [id]: { x: 800, y: 800 } } }))
    const before = { ...commits }
    act(() => api.dispatch({ type: 'cardsMoved', positions: { [id]: { x: 900, y: 900 } } }))
    expect(api.store.getState().layer?.positions[id]).toEqual({ x: 900, y: 900 })
    expect(commits).toEqual(before)
  })

  it('renders the notes again when a note is added', () => {
    const { api, board } = opened()
    const id = board.components[0]!.id
    const commits = counted(<NotesSection target={{ type: 'component', id }} />, api)
    const before = commits.notes
    act(() =>
      api.dispatch({ type: 'noteAdded', kind: 'note', text: 'Hello', target: { type: 'component', id }, id: 'note-aaaaaa', now: new Date() }),
    )
    expect(commits.notes).toBeGreaterThan(before)
  })

  it('keeps one store for each app', () => {
    const a = createAppStore()
    const b = createAppStore()
    a.dispatch({ type: 'boardOpened', board: nordetBoard(), warnings: [] })
    expect(b.store.getState().board).toBeUndefined()
  })
})
