import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'
import nordetRaw from './examples/nordet.board.json?raw'

function loadNordet() {
  fireEvent.click(screen.getByRole('button', { name: 'Load an example' }))
  fireEvent.click(screen.getByRole('button', { name: /Nordet follow-up/ }))
}

const nordet = JSON.parse(nordetRaw) as {
  title: string
  components: { id: string; label: string; explanation?: string }[]
  relationships: { id: string; from: string; to: string; kind: string; label: string }[]
}

describe('App', () => {
  it('shows three actions when no board is open', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Anatomy' })).toBeInTheDocument()
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('button', { name: 'Open board' })).toBeInTheDocument()
    expect(main.getByRole('button', { name: 'Load an example' })).toBeInTheDocument()
    expect(main.getByRole('button', { name: 'How to make a board' })).toBeInTheDocument()
  })

  it('opens an example and shows the overview', () => {
    render(<App />)
    loadNordet()
    expect(screen.getByRole('heading', { name: nordet.title })).toBeInTheDocument()
    const panel = screen.getByTestId('inspector')
    expect(within(panel).getByText('Covers')).toBeInTheDocument()
    expect(within(panel).getByText('Does not cover')).toBeInTheDocument()
  })

  it('shows a part with its explanation and source label', () => {
    render(<App />)
    loadNordet()
    const part = nordet.components.find((c) => c.explanation)!
    const panel = screen.getByTestId('inspector')
    fireEvent.click(within(panel).getAllByRole('button', { name: new RegExp(`^${part.label}`) })[0]!)
    expect(within(panel).getByRole('heading', { name: part.label })).toBeInTheDocument()
    expect(within(panel).getByText(/Agent explanation|Agent proposal|Documented|You said/)).toBeInTheDocument()
    expect(within(panel).getByText('Explanation')).toBeInTheDocument()
  })

  it('shows a connection in plain words', () => {
    render(<App />)
    loadNordet()
    const rel = nordet.relationships.find((r) => r.kind === 'sends-data-to')!
    const panel = screen.getByTestId('inspector')
    const buttons = within(panel).getAllByRole('button', { name: new RegExp(rel.label) })
    fireEvent.click(buttons[0]!)
    expect(within(panel).getByRole('heading', { name: rel.label })).toBeInTheDocument()
    expect(within(panel).getByText('sends data to')).toBeInTheDocument()
  })

  it('returns to the overview when Escape is pressed', () => {
    render(<App />)
    loadNordet()
    const panel = screen.getByTestId('inspector')
    const first = nordet.components[0]!
    fireEvent.click(within(panel).getAllByRole('button', { name: new RegExp(`^${first.label}`) })[0]!)
    expect(within(panel).getByRole('heading', { name: first.label })).toBeInTheDocument()
    fireEvent.keyDown(panel, { key: 'Escape' })
    expect(within(panel).getByRole('heading', { name: nordet.title })).toBeInTheDocument()
  })

  it('shows the problems for a bad file and keeps the open board', async () => {
    const { container } = render(<App />)
    loadNordet()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const bad = new File(['{ "format": "anatomy-board" '], 'broken.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [bad] } })
    await waitFor(() => expect(screen.getByText('was not opened')).toBeInTheDocument())
    expect(screen.getByText('broken.json')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: nordet.title })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('was not opened')).not.toBeInTheDocument()
  })

  it('opens the how-to dialog with a copyable prompt', () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: 'How to make a board' })[0]!)
    expect(screen.getByRole('dialog', { name: 'How to make a board', hidden: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download JSON Schema', hidden: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy prompt', hidden: true })).toBeInTheDocument()
  })
})
