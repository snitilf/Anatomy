import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Board } from '../board/schema'
import { AppStoreContext, createAppStore } from '../app/store'
import { clone, refundBoard } from '../layer/testBoards'
import { Shellless } from '../test/Shellless'
import { RevisionChange } from './RevisionChange'

const now = new Date('2026-11-28T10:00:00.000Z')

/** The word comparison is its own script, so the fields arrive a moment after the part opens. */
async function arrived() {
  const region = await screen.findByRole('region', { name: 'Changed in revision 2, before and after' })
  await within(region).findAllByRole('group')
  return region
}

function show(edit: (b: Board) => void, target: Parameters<typeof RevisionChange>[0]['target']) {
  const store = createAppStore()
  const board = refundBoard()
  store.dispatch({ type: 'boardOpened', board, warnings: [], now })
  const next = clone(board)
  next.revision = 2
  edit(next)
  store.dispatch({ type: 'boardOpened', board: next, warnings: [], previous: board, now })
  return render(
    <AppStoreContext.Provider value={store}>
      <Shellless>
        <RevisionChange target={target} />
      </Shellless>
    </AppStoreContext.Provider>,
  )
}

describe('the before and after of a changed part', () => {
  const id = refundBoard().components[0]!.id

  it('shows its heading only together with the fields, never an empty heading while the comparison loads', async () => {
    show((b) => void (b.components[0]!.summary = 'A first change.'), { type: 'component', id })
    expect(screen.queryByText('Changed in revision 2')).not.toBeInTheDocument()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    const group = await arrived()
    expect(within(group).getByRole('heading', { name: 'Changed in revision 2' })).toBeInTheDocument()
    expect(within(group).getAllByRole('group').length).toBeGreaterThan(0)
  })

  it('shows the old and the new words of each field, with the changed words marked', async () => {
    const was = refundBoard().components[0]!.summary
    show((b) => void (b.components[0]!.summary = `${was} Now with a limit.`), { type: 'component', id })
    const group = await arrived()
    const row = within(group).getByRole('group', { name: 'Summary' })
    expect(within(row).getByText('Before')).toBeInTheDocument()
    expect(within(row).getByText('Now')).toBeInTheDocument()
    // The words that are new are marked as an insertion, and the old text has nothing struck through.
    const added = row.querySelector('ins')
    expect(added).toHaveTextContent('Now with a limit.')
    expect(row.querySelector('del')).toBeNull()
  })

  it('marks removed words as deleted text, so the change reads without color', async () => {
    show((b) => void (b.components[0]!.label = 'Renamed part'), { type: 'component', id })
    await arrived()
    const row = screen.getByRole('group', { name: 'Name' })
    expect(row.querySelector('del')).toHaveTextContent(refundBoard().components[0]!.label)
    expect(row.querySelector('ins')).toHaveTextContent('Renamed part')
  })

  it('says None for a field that had no text', async () => {
    // The spending limit has no explanation yet.
    show((b) => void (b.components[1]!.explanation = 'It explains itself now.'), { type: 'component', id: refundBoard().components[1]!.id })
    await arrived()
    expect(within(screen.getByRole('group', { name: 'Explanation' })).getByText('None')).toBeInTheDocument()
  })

  it('shows nothing for a part that did not change', async () => {
    const other = refundBoard().components[3]!.id
    const view = show((b) => void (b.components[0]!.summary = 'Different.'), { type: 'component', id: other })
    expect(view.container).toBeEmptyDOMElement()
  })

  it('works for a connection and for the board itself', async () => {
    const line = refundBoard().relationships[0]!.id
    show((b) => void (b.relationships[0]!.label = 'a new label'), { type: 'relationship', id: line })
    await arrived()
    expect(screen.getByRole('group', { name: 'Label' })).toBeInTheDocument()
  })

  it('works for the title, goal, and scope of the board', async () => {
    show((b) => void (b.goal = 'A different goal.'), { type: 'board' })
    await arrived()
    expect(screen.getByRole('group', { name: 'Goal' })).toBeInTheDocument()
  })
})
