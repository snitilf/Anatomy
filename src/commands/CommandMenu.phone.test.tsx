import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../App'
import refundRaw from '../../e2e/fixtures/refund-approval.board.json?raw'
import { openBoardFile } from '../test/openFile'

const realMatchMedia = window.matchMedia

/** A phone-width query that a test can flip, telling the listeners as a resize would. */
function resizableViewport(startsAsPhone: boolean) {
  let phone = startsAsPhone
  const listeners = new Set<() => void>()
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return query === '(max-width: 760px)' && phone
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
  return {
    resizeTo(next: boolean) {
      phone = next
      act(() => listeners.forEach((l) => l()))
    },
    /** The change listeners that are on: the menu must hold one, not one per row. */
    get listening() {
      return listeners.size
    },
  }
}

/** The width of a phone, as the app reads it: the one media query that turns the sidebar into a sheet. */
function atPhoneWidth() {
  window.matchMedia = (query: string) =>
    ({
      matches: query === '(max-width: 760px)',
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

afterEach(() => {
  window.matchMedia = realMatchMedia
})

async function openMenu() {
  openBoardFile(refundRaw, 'refund-approval.board.json')
  await screen.findByTestId('inspector')
  await waitFor(() => expect(document.querySelector('.react-flow__node-card')).not.toBeNull())
  act(() => {
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true })
  })
  return within(await screen.findByRole('dialog', { name: 'Command menu' }))
}

describe('the command menu at phone width', () => {
  it('lists the drawing tools and their keys on a wide screen', async () => {
    render(<App />)
    const menu = await openMenu()
    expect(menu.getByText('Tools')).toBeInTheDocument()
    expect(menu.getByRole('option', { name: /^Pen/ })).toBeInTheDocument()
    expect(menu.getByRole('option', { name: /^Sticky note/ })).toBeInTheDocument()
    expect(document.querySelectorAll('[cmdk-item] kbd').length).toBeGreaterThan(0)
  })

  it('has no Tools group and no drawing tool, even when searched for', async () => {
    atPhoneWidth()
    render(<App />)
    const menu = await openMenu()
    expect(menu.queryByText('Tools')).not.toBeInTheDocument()
    for (const name of ['Select', 'Hand', 'Pen', 'Rectangle', 'Ellipse', 'Arrow', 'Text', 'Sticky note', 'New part']) {
      expect(menu.queryByRole('option', { name: new RegExp(`^${name}$|^${name}\\b`) })).not.toBeInTheDocument()
    }
    fireEvent.change(menu.getByRole('combobox'), { target: { value: 'draw' } })
    expect(await menu.findByText('Nothing matches "draw".')).toBeInTheDocument()
  })

  it('prints no keyboard shortcuts, which a phone has no keys for', async () => {
    atPhoneWidth()
    render(<App />)
    const menu = await openMenu()
    expect(menu.getAllByRole('option').length).toBeGreaterThan(3)
    expect(document.querySelectorAll('[cmdk-item] kbd')).toHaveLength(0)
  })

  it('does not start a drawing tool from its key', async () => {
    atPhoneWidth()
    render(<App />)
    openBoardFile(refundRaw, 'refund-approval.board.json')
    await screen.findByTestId('inspector')
    await waitFor(() => expect(document.querySelector('.react-flow__node-card')).not.toBeNull())
    act(() => {
      fireEvent.keyDown(document.body, { key: 'p' })
    })
    // No draw surface opens over the map, and no tool is left on.
    expect(document.querySelector('[data-draw-surface]')).toBeNull()
  })

  it('follows a resize across phone width while it is open', async () => {
    const viewport = resizableViewport(false)
    render(<App />)
    const menu = await openMenu()
    expect(menu.getByText('Tools')).toBeInTheDocument()
    expect(document.querySelectorAll('[cmdk-item] kbd').length).toBeGreaterThan(0)
    viewport.resizeTo(true)
    await waitFor(() => expect(menu.queryByText('Tools')).not.toBeInTheDocument())
    expect(menu.queryByRole('option', { name: /^Pen/ })).not.toBeInTheDocument()
    expect(document.querySelectorAll('[cmdk-item] kbd')).toHaveLength(0)
    viewport.resizeTo(false)
    await waitFor(() => expect(menu.getByText('Tools')).toBeInTheDocument())
    expect(menu.getByRole('option', { name: /^Pen/ })).toBeInTheDocument()
    expect(document.querySelectorAll('[cmdk-item] kbd').length).toBeGreaterThan(0)
  })

  it('listens once for the whole menu, not once for each row', async () => {
    const viewport = resizableViewport(false)
    render(<App />)
    openBoardFile(refundRaw, 'refund-approval.board.json')
    await screen.findByTestId('inspector')
    await waitFor(() => expect(document.querySelector('.react-flow__node-card')).not.toBeNull())
    const closed = viewport.listening
    act(() => {
      fireEvent.keyDown(document.body, { key: 'k', metaKey: true })
    })
    const menu = within(await screen.findByRole('dialog', { name: 'Command menu' }))
    expect(menu.getAllByRole('option').length).toBeGreaterThan(20)
    expect(viewport.listening - closed).toBeLessThanOrEqual(1)
  })
})
