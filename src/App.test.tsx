import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { SOURCE_LABEL } from './app/labels'
import type { SourceKind } from './board/schema'
import shortenerRaw from './examples/external/url-shortener.board.json?raw'
import exampleRaw from './examples/example.board.json?raw'
import { press } from './test/press'

async function loadExample() {
  fireEvent.click(screen.getByRole('button', { name: /Example check-in/ }))
  await screen.findByTestId('inspector')
}

const example = JSON.parse(exampleRaw) as {
  title: string
  components: { id: string; label: string; explanation?: string; source: { kind: SourceKind } }[]
  relationships: { id: string; from: string; to: string; kind: string; label: string }[]
}

const key = (k: string, mods: { meta?: boolean; shift?: boolean } = {}, target: Element = document.body) =>
  act(() => {
    fireEvent.keyDown(target, { key: k, metaKey: mods.meta ?? false, shiftKey: mods.shift ?? false })
  })

describe('App', () => {
  it('shows the open actions and the examples when no board is open', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Anatomy' })).toBeInTheDocument()
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('heading', { name: 'Open a repository to see its anatomy.' })).toBeInTheDocument()
    // jsdom has no folder picker, so the start screen says so and leads with a file.
    expect(main.getByText('This browser cannot open folders. Chrome and Edge can.')).toBeInTheDocument()
    expect(main.getByRole('button', { name: 'Open file' })).toBeInTheDocument()
    expect(main.queryByRole('button', { name: 'Open folder' })).not.toBeInTheDocument()
    // Examples are plain rows, each one action.
    expect(main.getByRole('button', { name: /Example check-in/ })).toBeInTheDocument()
    expect(main.getByRole('button', { name: /Anatomy itself/ })).toBeInTheDocument()
  })

  it('opens an example and shows the overview', async () => {
    render(<App />)
    await loadExample()
    const panel = within(screen.getByTestId('inspector'))
    expect(panel.getByRole('heading', { name: example.title })).toBeInTheDocument()
    expect(panel.getByText('Revision 1')).toBeInTheDocument()
    expect(panel.getByText('Covers')).toBeInTheDocument()
    expect(panel.getByText('Does not cover')).toBeInTheDocument()
    // The crumb names where the board came from.
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Example' })).toBeInTheDocument()
  })

  it('shows a part with its explanation and source label', async () => {
    render(<App />)
    await loadExample()
    const part = example.components.find((c) => c.explanation && c.source.kind !== 'agent-explanation')!
    const panel = screen.getByTestId('inspector')
    fireEvent.click(within(panel).getAllByRole('button', { name: new RegExp(`^${part.label}`) })[0]!)
    expect(within(panel).getByRole('heading', { name: part.label })).toBeInTheDocument()
    expect(within(panel).getByText(SOURCE_LABEL[part.source.kind])).toBeInTheDocument()
    expect(within(panel).getByText('Explanation')).toBeInTheDocument()
    expect(within(panel).getByRole('region', { name: 'Flow' })).toBeInTheDocument()
  })

  it('shows no source line for the default, the agent explanation', async () => {
    render(<App />)
    await loadExample()
    const part = example.components.find((c) => c.source.kind === 'agent-explanation')!
    const panel = screen.getByTestId('inspector')
    fireEvent.click(within(panel).getAllByRole('button', { name: new RegExp(`^${part.label}`) })[0]!)
    expect(within(panel).getByRole('heading', { name: part.label })).toBeInTheDocument()
    expect(within(panel).queryByText(SOURCE_LABEL['agent-explanation'])).not.toBeInTheDocument()
  })

  it('shows a connection in plain words', async () => {
    render(<App />)
    await loadExample()
    const rel = example.relationships.find((r) => r.kind === 'sends-data-to')!
    const panel = screen.getByTestId('inspector')
    fireEvent.click(within(panel).getAllByRole('button', { name: new RegExp(`^${rel.label}`) })[0]!)
    expect(within(panel).getByRole('heading', { name: rel.label })).toBeInTheDocument()
    expect(within(panel).getByText(/sends data to/)).toBeInTheDocument()
  })

  it('returns to the overview when Escape is pressed', async () => {
    render(<App />)
    await loadExample()
    const panel = screen.getByTestId('inspector')
    const first = example.components[0]!
    fireEvent.click(within(panel).getAllByRole('button', { name: new RegExp(`^${first.label}`) })[0]!)
    expect(within(panel).getByRole('heading', { name: first.label })).toBeInTheDocument()
    key('Escape', {}, panel)
    expect(within(panel).getByRole('heading', { name: example.title })).toBeInTheDocument()
  })

  it('shows the problems for a bad file and keeps the open board', async () => {
    const { container } = render(<App />)
    await loadExample()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const bad = new File(['{ "format": "anatomy-board" '], 'broken.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [bad] } })
    await waitFor(() => expect(screen.getByText('was not opened')).toBeInTheDocument())
    expect(screen.getByText('broken.json')).toBeInTheDocument()
    expect(within(screen.getByTestId('inspector')).getByRole('heading', { name: example.title })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('was not opened')).not.toBeInTheDocument()
  })

  it('opens a board written outside the app by another agent', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([shortenerRaw], 'url-shortener.board.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [file] } })
    const title = (JSON.parse(shortenerRaw) as { title: string }).title
    await waitFor(() => expect(within(screen.getByTestId('inspector')).getByRole('heading', { name: title })).toBeInTheDocument())
    expect(screen.queryByText('was not opened')).not.toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Local file' })).toBeInTheDocument()
  })

  it('opens every way to open a board from the folder crumb, and Escape closes it', async () => {
    render(<App />)
    await loadExample()
    const header = within(screen.getByRole('banner'))
    // Export, Open, and the help icon left the top bar.
    expect(header.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument()
    expect(header.queryByRole('button', { name: 'How to make a board' })).not.toBeInTheDocument()
    const trigger = header.getByRole('button', { name: 'Example' })
    press(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const panel = within(await screen.findByRole('dialog', { name: 'Open' }))
    expect(panel.getByRole('button', { name: 'Open file' })).toBeInTheDocument()
    expect(panel.getByRole('button', { name: /Anatomy itself/ })).toBeInTheDocument()
    fireEvent.keyDown(panel.getByRole('button', { name: 'Open file' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    // Escape in the popover must not clear what the sidebar shows.
    expect(within(screen.getByTestId('inspector')).getByRole('heading', { name: example.title })).toBeInTheDocument()
  })

  it('opens another example from the Open popover', async () => {
    render(<App />)
    await loadExample()
    press(within(screen.getByRole('banner')).getByRole('button', { name: 'Example' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Open' })).getByRole('button', { name: /Anatomy itself/ }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open' })).not.toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: example.title })).not.toBeInTheDocument()
  })

  it('opens the how-to dialog from the settings menu', async () => {
    render(<App />)
    press(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'How to make a board' }))
    expect(await screen.findByRole('dialog', { name: 'How to make a board', hidden: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download JSON Schema', hidden: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy prompt', hidden: true })).toBeInTheDocument()
  })

  it('says Copied in a toast after the prompt is copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<App />)
    press(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'How to make a board' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Copy prompt', hidden: true }))
    expect(await screen.findByText('Copied')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalled()
  })
})

describe('the command menu', () => {
  it('opens with Cmd+K, finds commands and parts, and runs one', async () => {
    render(<App />)
    await loadExample()
    key('k', { meta: true })
    const menu = within(await screen.findByRole('dialog', { name: 'Command menu' }))
    // Parts show only once something is typed.
    expect(menu.queryByRole('option', { name: new RegExp(`^${example.components[1]!.label}`) })).not.toBeInTheDocument()
    fireEvent.change(menu.getByRole('combobox'), { target: { value: example.components[1]!.label } })
    fireEvent.click(await menu.findByRole('option', { name: new RegExp(`^${example.components[1]!.label}`) }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command menu' })).not.toBeInTheDocument())
    await waitFor(() => expect(within(screen.getByTestId('inspector')).getByRole('heading', { name: example.components[1]!.label })).toBeInTheDocument())
  })

  it('says when nothing matches', async () => {
    render(<App />)
    key('k', { meta: true })
    const menu = within(await screen.findByRole('dialog', { name: 'Command menu' }))
    fireEvent.change(menu.getByRole('combobox'), { target: { value: 'zzzz' } })
    expect(await menu.findByText('Nothing matches "zzzz".')).toBeInTheDocument()
  })

  it('switches the theme and marks the one in use', async () => {
    render(<App />)
    key('k', { meta: true })
    const menu = within(await screen.findByRole('dialog', { name: 'Command menu' }))
    fireEvent.click(menu.getByRole('option', { name: /Theme: Dark/ }))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    key('k', { meta: true })
    const again = within(await screen.findByRole('dialog', { name: 'Command menu' }))
    expect(again.getByRole('option', { name: /Theme: Dark/ })).toHaveTextContent('in use')
    fireEvent.click(again.getByRole('option', { name: /Theme: System/ }))
  })
})

describe('the sidebar', () => {
  it('hides and shows with ] and the top bar button', async () => {
    render(<App />)
    await loadExample()
    key(']')
    expect(screen.queryByTestId('inspector')).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Show sidebar' }))
    expect(screen.getByTestId('inspector')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('anatomy:sidebar') ?? '{}')).toMatchObject({ open: true })
  })

  it('resizes from its edge with the keyboard and keeps the width', async () => {
    render(<App />)
    await loadExample()
    const edge = screen.getByRole('separator', { name: 'Sidebar width' })
    expect(edge).toHaveAttribute('aria-valuenow', '360')
    fireEvent.keyDown(edge, { key: 'ArrowLeft' })
    expect(edge).toHaveAttribute('aria-valuenow', '376')
    fireEvent.keyDown(edge, { key: 'Home' })
    expect(edge).toHaveAttribute('aria-valuenow', '520')
    fireEvent.doubleClick(edge)
    expect(edge).toHaveAttribute('aria-valuenow', '360')
  })
})
