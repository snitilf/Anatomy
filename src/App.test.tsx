import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { SOURCE_LABEL } from './app/labels'
import type { SourceKind } from './board/schema'
import shortenerRaw from '../e2e/fixtures/url-shortener.board.json?raw'
import refundRaw from '../e2e/fixtures/refund-approval.board.json?raw'
import { openConnection, openPart } from './test/openOnMap'
import { openBoardFile } from './test/openFile'
import { press } from './test/press'

async function loadRefund() {
  openBoardFile(refundRaw, 'refund-approval.board.json')
  await screen.findByTestId('inspector')
  // The map loads on its own script, a moment after the sidebar.
  await waitFor(() => expect(document.querySelector('.react-flow__node-card')).not.toBeNull())
}

const refund = JSON.parse(refundRaw) as {
  title: string
  components: { id: string; label: string; explanation?: string; source: { kind: SourceKind } }[]
  relationships: { id: string; from: string; to: string; kind: string; label: string; source: { kind: SourceKind } }[]
}

const key = (k: string, mods: { meta?: boolean; shift?: boolean } = {}, target: Element = document.body) =>
  act(() => {
    fireEvent.keyDown(target, { key: k, metaKey: mods.meta ?? false, shiftKey: mods.shift ?? false })
  })

describe('App', () => {
  it('shows the open actions and the examples when no board is open', () => {
    render(<App />)
    const banner = within(document.querySelector('header')!)
    expect(banner.getByText('Anatomy')).toBeInTheDocument()
    expect(banner.queryByRole('heading')).not.toBeInTheDocument()
    // A small mark sits beside the word. It is a picture, so it has no name of its own.
    const mark = screen.getByTestId('brand-mark')
    expect(mark).toHaveAttribute('aria-hidden', 'true')
    expect(mark.nextElementSibling).toBe(banner.getByText('Anatomy'))
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('heading', { level: 1, name: 'Open a repository to see its anatomy.' })).toBeInTheDocument()
    // jsdom has no folder picker, so the start screen says so and leads with a file.
    expect(main.getByText('This browser cannot open folders. Chrome and Edge can.')).toBeInTheDocument()
    expect(main.getByRole('button', { name: 'Open file' })).toBeInTheDocument()
    expect(main.queryByRole('button', { name: 'Open folder' })).not.toBeInTheDocument()
    // Examples are plain rows, each one action.
    expect(main.getByRole('button', { name: /How the Claude Code harness works/ })).toBeInTheDocument()
    expect(main.getByRole('button', { name: /Anatomy itself/ })).toBeInTheDocument()
    expect(main.getByRole('button', { name: /How a large language model like Opus 5.5 works/ })).toBeInTheDocument()
  })

  it('opens an example and shows the overview', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /How the Claude Code harness works/ }))
    await screen.findByTestId('inspector')
    const panel = within(screen.getByTestId('inspector'))
    expect(panel.getByRole('heading', { name: 'How the Claude Code harness works' })).toBeInTheDocument()
    expect(panel.getByText(/revision 1/)).toBeInTheDocument()
    // Scope and open items live on the Overview page, not in the sidebar.
    expect(panel.queryByText('Covers')).not.toBeInTheDocument()
    expect(panel.queryByText('Open items')).not.toBeInTheDocument()
    expect(panel.getByRole('region', { name: 'Start here' })).toBeInTheDocument()
    // The crumb names where the board came from.
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Example' })).toBeInTheDocument()
  })

  it('opens the Overview page on the goal, then Start here, then Scope, Parts, and Details', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /How the Claude Code harness works/ }))
    await screen.findByTestId('inspector')
    press(screen.getByRole('tab', { name: 'Overview' }))
    const page = within(screen.getByTestId('overview'))
    const goal = page.getByRole('heading', { level: 1 }).nextElementSibling!
    const start = page.getByRole('heading', { name: 'Start here' })
    const scope = page.getByRole('heading', { name: 'Scope' })
    const parts = page.getByRole('heading', { name: /^Parts/ })
    const details = page.getByRole('heading', { name: 'Details' })
    const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(goal, start)).toBe(true)
    expect(before(start, parts)).toBe(true)
    expect(before(scope, details)).toBe(true)
  })

  it('draws the line key button as a key, not a question mark', async () => {
    render(<App />)
    await loadRefund()
    const button = screen.getByRole('button', { name: 'Line key' })
    expect(button.querySelector('.lucide-key-round')).not.toBeNull()
    expect(button.querySelector('.lucide-circle-help, .lucide-circle-question-mark')).toBeNull()
  })

  it('shows a part with its explanation and source label', async () => {
    render(<App />)
    await loadRefund()
    const part = refund.components.find((c) => c.explanation && c.source.kind !== 'agent-explanation')!
    const panel = screen.getByTestId('inspector')
    openPart(part.label)
    expect(within(panel).getByRole('heading', { name: part.label })).toBeInTheDocument()
    expect(within(panel).getByText(SOURCE_LABEL[part.source.kind])).toBeInTheDocument()
    expect(within(panel).getByText('Explanation')).toBeInTheDocument()
    expect(within(panel).getByRole('region', { name: 'Connections' })).toBeInTheDocument()
  })

  it('shows the source of a part even when it is the agent explanation', async () => {
    render(<App />)
    await loadRefund()
    const part = refund.components.find((c) => c.source.kind === 'agent-explanation')!
    const panel = screen.getByTestId('inspector')
    openPart(part.label)
    expect(within(panel).getByRole('heading', { name: part.label })).toBeInTheDocument()
    const source = panel.querySelector('[data-source="agent-explanation"]')!
    expect(source).toHaveTextContent(SOURCE_LABEL['agent-explanation'])
    expect(source.querySelector('svg')).not.toBeNull()
  })

  it.each(['agent-explanation', 'agent-proposal'] as const)('shows the Source row of a connection whose source is %s', async (kind) => {
    render(<App />)
    await loadRefund()
    const rel = refund.relationships.find((r) => r.source.kind === kind)!
    const panel = screen.getByTestId('inspector')
    await openConnection(rel.label)
    expect(within(panel).getByRole('heading', { name: rel.label })).toBeInTheDocument()
    expect(within(panel).getByText('Source').closest('div')).toHaveTextContent(SOURCE_LABEL[kind])
  })

  it('shows a connection in plain words', async () => {
    render(<App />)
    await loadRefund()
    const rel = refund.relationships.find((r) => r.kind === 'sends-data-to')!
    const panel = screen.getByTestId('inspector')
    await openConnection(rel.label)
    expect(within(panel).getByRole('heading', { name: rel.label })).toBeInTheDocument()
    expect(within(panel).getByText(/sends data to/)).toBeInTheDocument()
  })

  it('returns to the overview when Escape is pressed', async () => {
    render(<App />)
    await loadRefund()
    const panel = screen.getByTestId('inspector')
    const first = refund.components[0]!
    openPart(first.label)
    expect(within(panel).getByRole('heading', { name: first.label })).toBeInTheDocument()
    key('Escape', {}, panel)
    expect(within(panel).getByRole('heading', { name: refund.title })).toBeInTheDocument()
  })

  it('shows the problems for a bad file and keeps the open board', async () => {
    const { container } = render(<App />)
    await loadRefund()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const bad = new File(['{ "format": "anatomy-board" '], 'broken.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [bad] } })
    await waitFor(() => expect(screen.getByText('was not opened')).toBeInTheDocument())
    expect(screen.getByText('broken.json')).toBeInTheDocument()
    expect(within(screen.getByTestId('inspector')).getByRole('heading', { name: refund.title })).toBeInTheDocument()
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
    await loadRefund()
    const header = within(screen.getByRole('banner'))
    // Export, Open, and the help icon left the top bar.
    expect(header.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument()
    expect(header.queryByRole('button', { name: 'How to make a board' })).not.toBeInTheDocument()
    const trigger = header.getByRole('button', { name: 'Local file' })
    press(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const panel = within(await screen.findByRole('dialog', { name: 'Open' }))
    expect(panel.getByRole('button', { name: 'Open file' })).toBeInTheDocument()
    expect(panel.getByRole('button', { name: /Anatomy itself/ })).toBeInTheDocument()
    fireEvent.keyDown(panel.getByRole('button', { name: 'Open file' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open' })).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    // Escape in the popover must not clear what the sidebar shows.
    expect(within(screen.getByTestId('inspector')).getByRole('heading', { name: refund.title })).toBeInTheDocument()
  })

  it('opens another example from the Open popover', async () => {
    render(<App />)
    await loadRefund()
    press(within(screen.getByRole('banner')).getByRole('button', { name: 'Local file' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Open' })).getByRole('button', { name: /Anatomy itself/ }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Open' })).not.toBeInTheDocument())
    // The example loads on demand, so the board changes a moment after the popover closes.
    expect(await within(screen.getByTestId('inspector')).findByRole('heading', { name: 'Anatomy: how a board becomes a map' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: refund.title })).not.toBeInTheDocument()
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
    await loadRefund()
    key('k', { meta: true })
    const menu = within(await screen.findByRole('dialog', { name: 'Command menu' }))
    // Parts show only once something is typed.
    expect(menu.queryByRole('option', { name: new RegExp(`^${refund.components[1]!.label}`) })).not.toBeInTheDocument()
    fireEvent.change(menu.getByRole('combobox'), { target: { value: refund.components[1]!.label } })
    fireEvent.click(await menu.findByRole('option', { name: new RegExp(`^${refund.components[1]!.label}`) }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command menu' })).not.toBeInTheDocument())
    await waitFor(() => expect(within(screen.getByTestId('inspector')).getByRole('heading', { name: refund.components[1]!.label })).toBeInTheDocument())
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
    await loadRefund()
    key(']')
    expect(screen.queryByTestId('inspector')).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Show sidebar' }))
    expect(screen.getByTestId('inspector')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('anatomy:sidebar') ?? '{}')).toMatchObject({ open: true })
  })

  it('resizes from its edge with the keyboard and keeps the width', async () => {
    render(<App />)
    await loadRefund()
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
