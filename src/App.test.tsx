import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import shortenerRaw from './examples/external/url-shortener.board.json?raw'
import nordetRaw from './examples/nordet.board.json?raw'
import { press } from './test/press'

async function loadNordet() {
  press(screen.getByRole('button', { name: 'Load an example' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: /Nordet follow-up/ }))
}

const nordet = JSON.parse(nordetRaw) as {
  title: string
  components: { id: string; label: string; explanation?: string }[]
  relationships: { id: string; from: string; to: string; kind: string; label: string }[]
}

describe('App', () => {
  it('shows the open and example actions when no board is open', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Anatomy' })).toBeInTheDocument()
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('button', { name: 'Open board' })).toBeInTheDocument()
    expect(main.getByRole('button', { name: 'Load an example' })).toBeInTheDocument()
    // The toolbar has the how-to button, so the start screen does not repeat it.
    expect(main.queryByRole('button', { name: 'How to make a board' })).not.toBeInTheDocument()
  })

  it('opens an example and shows the overview', async () => {
    render(<App />)
    await loadNordet()
    expect(screen.getByRole('heading', { name: nordet.title })).toBeInTheDocument()
    const panel = screen.getByTestId('inspector')
    expect(within(panel).getByText('Covers')).toBeInTheDocument()
    expect(within(panel).getByText('Does not cover')).toBeInTheDocument()
  })

  it('shows a part with its explanation and source label', async () => {
    render(<App />)
    await loadNordet()
    const part = nordet.components.find((c) => c.explanation)!
    const panel = screen.getByTestId('inspector')
    fireEvent.click(within(panel).getAllByRole('button', { name: new RegExp(`^${part.label}`) })[0]!)
    expect(within(panel).getByRole('heading', { name: part.label })).toBeInTheDocument()
    expect(within(panel).getByText(/Agent explanation|Agent proposal|Documented|You said/)).toBeInTheDocument()
    expect(within(panel).getByText('Explanation')).toBeInTheDocument()
  })

  it('shows a connection in plain words', async () => {
    render(<App />)
    await loadNordet()
    const rel = nordet.relationships.find((r) => r.kind === 'sends-data-to')!
    const panel = screen.getByTestId('inspector')
    const buttons = within(panel).getAllByRole('button', { name: new RegExp(rel.label) })
    fireEvent.click(buttons[0]!)
    expect(within(panel).getByRole('heading', { name: rel.label })).toBeInTheDocument()
    expect(within(panel).getByText('sends data to')).toBeInTheDocument()
  })

  it('returns to the overview when Escape is pressed', async () => {
    render(<App />)
    await loadNordet()
    const panel = screen.getByTestId('inspector')
    const first = nordet.components[0]!
    fireEvent.click(within(panel).getAllByRole('button', { name: new RegExp(`^${first.label}`) })[0]!)
    expect(within(panel).getByRole('heading', { name: first.label })).toBeInTheDocument()
    fireEvent.keyDown(panel, { key: 'Escape' })
    expect(within(panel).getByRole('heading', { name: nordet.title })).toBeInTheDocument()
  })

  it('shows the problems for a bad file and keeps the open board', async () => {
    const { container } = render(<App />)
    await loadNordet()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const bad = new File(['{ "format": "anatomy-board" '], 'broken.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [bad] } })
    await waitFor(() => expect(screen.getByText('was not opened')).toBeInTheDocument())
    expect(screen.getByText('broken.json')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: nordet.title })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('was not opened')).not.toBeInTheDocument()
  })

  it('opens a board written outside the app by another agent', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([shortenerRaw], 'url-shortener.board.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [file] } })
    const title = (JSON.parse(shortenerRaw) as { title: string }).title
    await waitFor(() => expect(screen.getByRole('heading', { name: title })).toBeInTheDocument())
    expect(screen.queryByText('was not opened')).not.toBeInTheDocument()
  })

  it('groups every way to open a board under one Open popover, and Escape closes it', async () => {
    render(<App />)
    await loadNordet()
    const header = within(screen.getByRole('banner'))
    expect(header.queryByRole('button', { name: 'Examples' })).not.toBeInTheDocument()
    expect(header.queryByRole('button', { name: 'Saved boards' })).not.toBeInTheDocument()
    const trigger = header.getByRole('button', { name: 'Open' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    press(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const panel = within(await screen.findByRole('dialog', { name: 'Open a board' }))
    expect(panel.getByRole('button', { name: 'Open a file' })).toBeInTheDocument()
    expect(panel.getByRole('button', { name: /Anatomy itself/ })).toBeInTheDocument()
    fireEvent.keyDown(panel.getByRole('button', { name: 'Open a file' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open a board' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // Escape in the popover must not clear what is selected on the map.
    expect(screen.getByTestId('inspector')).toBeInTheDocument()
  })

  it('closes the Open popover with a press outside it', async () => {
    render(<App />)
    await loadNordet()
    press(within(screen.getByRole('banner')).getByRole('button', { name: 'Open' }))
    await screen.findByRole('dialog', { name: 'Open a board' })
    press(document.body)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open a board' })).not.toBeInTheDocument())
  })

  it('opens another example from the Open popover', async () => {
    render(<App />)
    await loadNordet()
    press(within(screen.getByRole('banner')).getByRole('button', { name: 'Open' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Open a board' })).getByRole('button', { name: /Anatomy itself/ }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open a board' })).not.toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: nordet.title })).not.toBeInTheDocument()
  })

  it('moves through the examples on the start screen with the arrow keys, and Escape returns focus', async () => {
    render(<App />)
    const trigger = screen.getByRole('button', { name: 'Load an example' })
    press(trigger)
    const items = await screen.findAllByRole('menuitem')
    expect(items.length).toBeGreaterThan(1)
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' })
    await waitFor(() => expect(items[1]).toHaveFocus())
    fireEvent.keyDown(items[1]!, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('opens the how-to dialog with a copyable prompt', async () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: 'How to make a board' })[0]!)
    expect(screen.getByRole('dialog', { name: 'How to make a board', hidden: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download JSON Schema', hidden: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy prompt', hidden: true })).toBeInTheDocument()
  })

  it('says Copied in a toast after the prompt is copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: 'How to make a board' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt', hidden: true }))
    expect(await screen.findByText('Copied')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalled()
  })
})
