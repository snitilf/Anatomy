import { afterEach, describe, expect, it, vi } from 'vitest'
import refundRaw from '../../e2e/fixtures/refund-approval.board.json?raw'
import { initialState } from '../app/state'
import { createUi } from '../app/ui'
import type { WorkspaceApi } from '../app/workspaceContext'
import { parseBoard } from '../board/validate'
import { addNote } from '../layer/edits'
import { emptyLayer, type Layer } from '../layer/model'
import { refundBoard } from '../layer/testBoards'
import { commandById, COMMANDS, isListed } from './list'
import type { CommandContext } from './types'

const realMatchMedia = window.matchMedia
const parsed = parseBoard(refundRaw)
if (!parsed.ok) throw new Error('refund fixture failed to parse')
const board = parsed.board

function setPhone(phone: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: query === '(max-width: 760px)' && phone,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false
      },
    }) as MediaQueryList
}

function makeContext(overrides: { hasBoard?: boolean; view?: 'map' | 'overview'; selectedPart?: string; layer?: Layer; tab?: 'details' | 'review' } = {}): {
  ctx: CommandContext
  dispatch: ReturnType<typeof vi.fn>
} {
  const uiApi = createUi()
  if (overrides.view) uiApi.setViewState(overrides.view)
  if (overrides.tab) uiApi.setTab(overrides.tab)
  const dispatch = vi.fn()
  const state = overrides.hasBoard
    ? {
        ...initialState,
        board,
        ...(overrides.layer ? { layer: overrides.layer } : {}),
        ...(overrides.selectedPart ? { selection: { type: 'component' as const, id: overrides.selectedPart } } : {}),
      }
    : initialState
  const ctx: CommandContext = {
    state,
    ui: uiApi.store.getState(),
    dispatch,
    uiApi,
    workspace: { canOpenFolder: true } as WorkspaceApi,
    shell: {
      openFile: vi.fn(),
      toOverview: vi.fn(),
      closeWalkthrough: vi.fn(),
      playWalkthrough: vi.fn(),
      copyPrompt: vi.fn(),
    },
    camera: undefined,
  }
  return { ctx, dispatch }
}

afterEach(() => {
  window.matchMedia = realMatchMedia
})

describe('Start screen command', () => {
  it('is listed only while a board is open and dispatches closed', () => {
    const start = COMMANDS.find((c) => c.label === 'Start screen')
    expect(start).toBeDefined()

    const empty = makeContext({ hasBoard: false })
    expect(isListed(start!, empty.ctx)).toBe(false)

    const open = makeContext({ hasBoard: true })
    expect(isListed(start!, open.ctx)).toBe(true)

    start!.run(open.ctx)
    expect(open.dispatch).toHaveBeenCalledWith({ type: 'closed' })
  })
})

describe('phone View commands', () => {
  it('omits View commands that do nothing on a phone while keeping the ones that work', () => {
    setPhone(true)
    const map = makeContext({ hasBoard: true, view: 'map', selectedPart: board.components[0]!.id }).ctx

    for (const id of ['sidebar.toggle', 'zoom.in', 'zoom.out', 'zoom.reset', 'linekey']) {
      expect(isListed(commandById(id), map), `${id} should be hidden on phone`).toBe(false)
    }
    expect(isListed(commandById('zoom.fit'), map)).toBe(true)
    expect(isListed(commandById('zoom.selection'), map)).toBe(true)

    const overview = makeContext({ hasBoard: true, view: 'overview' }).ctx
    expect(isListed(commandById('overview.filter'), overview)).toBe(true)
  })

  it('lists all View commands on a desktop screen', () => {
    setPhone(false)
    const map = makeContext({ hasBoard: true, view: 'map' }).ctx

    for (const id of ['sidebar.toggle', 'zoom.in', 'zoom.out', 'zoom.reset', 'zoom.fit', 'linekey']) {
      expect(isListed(commandById(id), map), `${id} should be listed on desktop`).toBe(true)
    }
  })
})

describe('unified command naming', () => {
  it('unifies navigation command naming across Board and Overview in the Go to group', () => {
    expect(commandById('goto.overview').label).toBe('Go to Board')
    expect(commandById('view.overview').label).toBe('Go to Overview')
    expect(commandById('view.map').label).toBe('Go to Map')
    expect(commandById('goto.review').label).toBe('Go to Review')
  })
})

describe('review step commands', () => {
  /** A layer with one answered question and one kept answer. */
  function layer(): Layer {
    const source = refundBoard()
    const answered = addNote(emptyLayer(source.id), source, { kind: 'question', text: 'Why?', target: { type: 'board' } }, new Date('2026-01-01T00:00:00.000Z'), 'note-aaaaaa')
    const kept = addNote(answered, source, { kind: 'question', text: 'Again?', target: { type: 'board' } }, new Date('2026-01-01T00:00:00.000Z'), 'note-bbbbbb')
    const response = { respondsTo: 'feedback-aaaaaa', status: 'answered' as const, text: 'Because.', changed: [] }
    return { ...kept, answers: [{ id: 'note-aaaaaa', response }, { id: 'note-bbbbbb', response }], kept: ['note-bbbbbb'] }
  }

  it('step with J and K only while the Review tab is in front and an answer waits', () => {
    const on = makeContext({ hasBoard: true, layer: layer(), tab: 'review' })
    expect(isListed(commandById('review.next'), on.ctx)).toBe(true)
    expect(isListed(commandById('review.previous'), on.ctx)).toBe(true)
    expect(commandById('review.next').keys).toEqual(['J'])
    expect(commandById('review.previous').keys).toEqual(['K'])

    const details = makeContext({ hasBoard: true, layer: layer(), tab: 'details' })
    expect(isListed(commandById('review.next'), details.ctx)).toBe(false)

    const nothingLeft = makeContext({ hasBoard: true, tab: 'review' })
    expect(isListed(commandById('review.next'), nothingLeft.ctx)).toBe(false)
  })

  it('does nothing when the Review tab holds no card for the step', () => {
    const off = makeContext({ hasBoard: true, layer: layer(), tab: 'review' })
    // No card is mounted in this test, so the step finds no row and changes nothing.
    commandById('review.next').run(off.ctx)
    expect(off.dispatch).not.toHaveBeenCalled()
  })

  it('opens the Answers group when the user had closed it, so the step has a card to land on', () => {
    const closed = makeContext({ hasBoard: true, layer: layer(), tab: 'review' })
    closed.ctx.uiApi.setGroup('answers', false)
    closed.ctx.ui = closed.ctx.uiApi.store.getState()
    commandById('review.previous').run(closed.ctx)
    expect(closed.ctx.uiApi.store.getState().groups.answers).toBe(true)
  })
})
