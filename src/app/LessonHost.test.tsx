import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board } from '../board/schema'
import { refundBoard } from '../layer/testBoards'
import { LessonHost } from './LessonHost'
import { AppStoreContext, createAppStore } from './store'
import { createUi, UiContext } from './ui'

vi.mock('../lessons/LessonDialog', () => ({
  LessonDialog: ({ lessonId, onClose }: { lessonId: string; onClose: () => void }) => (
    <div role="dialog" aria-label={lessonId}>
      <button type="button" onClick={onClose}>
        Close lesson
      </button>
    </div>
  ),
}))

const PART = 'permission-check'

/** The refund board with one part that carries the approval gate lesson. */
function withLesson(board: Board = refundBoard(), part = PART): Board {
  const [first, ...rest] = board.components
  if (!first) throw new Error('the test board has no parts')
  return { ...board, components: [{ ...first, id: part, lesson: 'approval-gate' }, ...rest] }
}

function setup(ui = createUi()) {
  const api = createAppStore()
  const board = withLesson()
  api.dispatch({ type: 'boardOpened', board, warnings: [] })
  const wrap = (children: ReactNode) => (
    <UiContext.Provider value={ui}>
      <AppStoreContext.Provider value={api}>{children}</AppStoreContext.Provider>
    </UiContext.Provider>
  )
  return { api, ui, board, wrap }
}

// jsdom draws nothing, so every element has no box. A test marks the ones that are hidden and the rest get one.
const rects = Element.prototype.getClientRects
beforeEach(() => {
  Element.prototype.getClientRects = function (this: Element) {
    return (this.closest('[data-nobox]') ? [] : [{}]) as unknown as DOMRectList
  }
})
afterEach(() => {
  Element.prototype.getClientRects = rects
})

describe('what keeps a lesson open', () => {
  it('does not close a lesson that was open before it mounted, and shows it', () => {
    const { ui, wrap } = setup()
    ui.openLesson('approval-gate', PART)
    render(wrap(<LessonHost />))
    expect(screen.getByRole('dialog', { name: 'approval-gate' })).toBeInTheDocument()
  })

  it('closes when another board opens', () => {
    const { api, ui, board, wrap } = setup()
    render(wrap(<LessonHost />))
    act(() => ui.openLesson('approval-gate', PART))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => api.dispatch({ type: 'boardOpened', board: { ...board, id: 'another-board' }, warnings: [] }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(ui.store.getState().lesson).toBeUndefined()
  })

  it('closes when the board closes to the start screen', () => {
    const { api, ui, wrap } = setup()
    render(wrap(<LessonHost />))
    act(() => ui.openLesson('approval-gate', PART))
    act(() => api.dispatch({ type: 'closed' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(ui.store.getState().lesson).toBeUndefined()
  })

  it('stays open when a new revision of the same board still has the part and its lesson', () => {
    const { api, ui, board, wrap } = setup()
    render(wrap(<LessonHost />))
    act(() => ui.openLesson('approval-gate', PART))
    act(() => api.dispatch({ type: 'boardOpened', board: { ...board, revision: board.revision + 1 }, warnings: [] }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes when a new revision of the same board removes the part that opened it', () => {
    const { api, ui, board, wrap } = setup()
    render(wrap(<LessonHost />))
    act(() => ui.openLesson('approval-gate', PART))
    act(() => api.dispatch({ type: 'boardOpened', board: { ...board, revision: board.revision + 1, components: board.components.filter((c) => c.id !== PART) }, warnings: [] }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(ui.store.getState().lesson).toBeUndefined()
  })

  it('closes when a new revision of the same board drops the lesson from the part, or changes it', () => {
    for (const lesson of [undefined, 'some-other-lesson']) {
      const { api, ui, board, wrap } = setup()
      const { unmount } = render(wrap(<LessonHost />))
      act(() => ui.openLesson('approval-gate', PART))
      act(() =>
        api.dispatch({
          type: 'boardOpened',
          board: { ...board, revision: board.revision + 1, components: board.components.map((c) => (c.id === PART ? { ...c, lesson } : c)) },
          warnings: [],
        }),
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      unmount()
    }
  })
})

describe('where focus goes when the lesson closes', () => {
  /** Opens the lesson, closes it through its Close button, and waits for focus to settle. */
  async function closeAndLand(wrap: ReturnType<typeof setup>['wrap'], ui: ReturnType<typeof setup>['ui'], fixture: ReactNode) {
    render(wrap(<>{fixture}<LessonHost /></>))
    act(() => ui.openLesson('approval-gate', PART))
    fireEvent.click(screen.getByRole('button', { name: 'Close lesson' }))
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))
    return document.activeElement as HTMLElement
  }

  it('is the row that opened it', async () => {
    const { ui, wrap } = setup()
    const landed = await closeAndLand(wrap, ui, <button data-lesson-opener={PART}>row</button>)
    expect(landed).toHaveTextContent('row')
  })

  it('skips a row under an inert page and takes the one that can be used', async () => {
    const { ui, wrap } = setup()
    const landed = await closeAndLand(
      wrap,
      ui,
      <>
        <aside inert>
          <button data-lesson-opener={PART}>inert row</button>
        </aside>
        <div data-overview>
          <button data-lesson-opener={PART}>overview row</button>
        </div>
      </>,
    )
    expect(landed).toHaveTextContent('overview row')
  })

  it('skips a row in the phone sheet at its lowest stop, a hidden row, and a row with no box', async () => {
    const { ui, wrap } = setup()
    const landed = await closeAndLand(
      wrap,
      ui,
      <>
        <section data-stop="0">
          <button data-lesson-opener={PART}>low sheet row</button>
        </section>
        <div hidden>
          <button data-lesson-opener={PART}>hidden row</button>
        </div>
        <div style={{ visibility: 'hidden' }}>
          <button data-lesson-opener={PART}>invisible row</button>
        </div>
        <div data-nobox="">
          <button data-lesson-opener={PART}>no box row</button>
        </div>
        <section data-stop="1">
          <button data-lesson-opener={PART}>half sheet row</button>
        </section>
      </>,
    )
    expect(landed).toHaveTextContent('half sheet row')
  })

  it('takes the panel heading, not the Details tab, when the row is gone', async () => {
    const { ui, wrap } = setup()
    const landed = await closeAndLand(
      wrap,
      ui,
      <aside data-testid="inspector">
        <button role="tab">Details</button>
        <h2 tabIndex={-1}>Permission check</h2>
      </aside>,
    )
    expect(landed.tagName).toBe('H2')
  })

  it('takes the sheet header when the sheet is at its lowest stop and the row is gone', async () => {
    const { ui, wrap } = setup()
    const landed = await closeAndLand(
      wrap,
      ui,
      <section data-testid="inspector" data-stop="0">
        <button>Sheet header</button>
        <h2 tabIndex={-1}>Permission check</h2>
      </section>,
    )
    expect(landed).toHaveTextContent('Sheet header')
  })

  it('skips an inert sidebar and goes to the Overview', async () => {
    const { ui, wrap } = setup()
    const landed = await closeAndLand(
      wrap,
      ui,
      <>
        <aside data-testid="inspector" inert>
          <button role="tab">Details</button>
          <h2 tabIndex={-1}>Permission check</h2>
        </aside>
        <div data-testid="overview" tabIndex={-1}>
          page
        </div>
      </>,
    )
    expect(landed).toHaveAttribute('data-testid', 'overview')
  })

  it('goes to the Show sidebar button when the desktop sidebar is hidden and no page covers the map', async () => {
    const { ui, wrap } = setup()
    const landed = await closeAndLand(wrap, ui, <button aria-label="Show sidebar">toggle</button>)
    expect(landed).toHaveAttribute('aria-label', 'Show sidebar')
  })

  it('goes to the Search button when nothing else can take it, and never to the page', async () => {
    const { ui, wrap } = setup()
    const landed = await closeAndLand(wrap, ui, <button aria-label="Search">search</button>)
    expect(landed).toHaveAttribute('aria-label', 'Search')
  })
})

describe('closing the lesson', () => {
  it('does not tell the store when nothing is open', () => {
    const { ui } = setup()
    const seen = vi.fn()
    const off = ui.store.subscribe(seen)
    ui.closeLesson()
    off()
    expect(seen).not.toHaveBeenCalled()
  })
})
