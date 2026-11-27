import { afterEach, describe, expect, it, vi } from 'vitest'
import refundRaw from '../../e2e/fixtures/refund-approval.board.json?raw'
import { initialState } from '../app/state'
import { createUi } from '../app/ui'
import type { WorkspaceApi } from '../app/workspaceContext'
import { parseBoard } from '../board/validate'
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

function makeContext(overrides: { hasBoard?: boolean; view?: 'map' | 'overview'; selectedPart?: string } = {}): {
  ctx: CommandContext
  dispatch: ReturnType<typeof vi.fn>
} {
  const uiApi = createUi()
  if (overrides.view) uiApi.setViewState(overrides.view)
  const dispatch = vi.fn()
  const state = overrides.hasBoard
    ? {
        ...initialState,
        board,
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
