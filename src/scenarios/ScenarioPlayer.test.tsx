import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import App from '../App'
import exampleRaw from '../examples/example.board.json?raw'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

const example = JSON.parse(exampleRaw) as {
  scenarios: { id: string; title: string; steps: { caption: string; highlight: string[] }[] }[]
  components: { id: string; label: string; lesson?: string }[]
}
const walk = example.scenarios[0]!

function loadExample() {
  fireEvent.click(screen.getByRole('button', { name: 'Load an example' }))
  fireEvent.click(screen.getByRole('button', { name: /Example check-in/ }))
}

function play() {
  const button = screen.getByRole('button', { name: `Play ${walk.title}` })
  button.focus()
  fireEvent.click(button)
  return button
}

const bar = () => screen.getByRole('region', { name: `Walkthrough: ${walk.title}` })

describe('walkthroughs', () => {
  it('lists the walkthroughs in the overview, with a step count', () => {
    render(<App />)
    loadExample()
    const panel = screen.getByTestId('inspector')
    expect(within(panel).getByRole('heading', { name: 'Walkthroughs' })).toBeInTheDocument()
    for (const s of example.scenarios) expect(within(panel).getByText(s.title)).toBeInTheDocument()
    expect(within(panel).getByText(`${walk.steps.length} steps`)).toBeInTheDocument()
  })

  it('plays from the overview and shows step 1 with its caption', () => {
    render(<App />)
    loadExample()
    play()
    const player = within(bar())
    expect(player.getByText(`Step 1 of ${walk.steps.length}`)).toBeInTheDocument()
    expect(player.getByText(walk.steps[0]!.caption)).toBeInTheDocument()
    expect(player.getByText('Teaching sequence. Nothing runs.')).toBeInTheDocument()
    expect(player.getByText(walk.steps[0]!.caption)).toHaveAttribute('aria-live', 'polite')
  })

  it('moves with Next, Previous, and the arrow keys, and stops at both ends', () => {
    render(<App />)
    loadExample()
    play()
    const player = within(bar())
    fireEvent.click(player.getByRole('button', { name: 'Next' }))
    expect(player.getByText(`Step 2 of ${walk.steps.length}`)).toBeInTheDocument()
    expect(player.getByText(walk.steps[1]!.caption)).toBeInTheDocument()
    fireEvent.click(player.getByRole('button', { name: 'Previous' }))
    expect(player.getByText(`Step 1 of ${walk.steps.length}`)).toBeInTheDocument()
    fireEvent.click(player.getByRole('button', { name: 'Previous' }))
    expect(player.getByText(`Step 1 of ${walk.steps.length}`)).toBeInTheDocument()

    fireEvent.keyDown(bar(), { key: 'ArrowRight' })
    fireEvent.keyDown(bar(), { key: 'ArrowRight' })
    expect(player.getByText(`Step 3 of ${walk.steps.length}`)).toBeInTheDocument()
    fireEvent.keyDown(bar(), { key: 'ArrowLeft' })
    expect(player.getByText(`Step 2 of ${walk.steps.length}`)).toBeInTheDocument()
    for (let i = 0; i < 10; i++) fireEvent.keyDown(bar(), { key: 'ArrowRight' })
    expect(player.getByText(`Step ${walk.steps.length} of ${walk.steps.length}`)).toBeInTheDocument()
  })

  it('moves focus into the player on start, and Escape closes it and returns focus to Play', async () => {
    render(<App />)
    loadExample()
    const button = play()
    await waitFor(() => expect(bar().contains(document.activeElement)).toBe(true))
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: /Walkthrough/ })).not.toBeInTheDocument()
    await waitFor(() => expect(button).toHaveFocus())
  })

  it('closes from the Close button', () => {
    render(<App />)
    loadExample()
    play()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: /Walkthrough/ })).not.toBeInTheDocument()
  })

  it('marks the highlighted parts and dims the others', () => {
    const { container } = render(<App />)
    loadExample()
    expect(container.querySelector('[data-highlighted]')).toBeNull()
    expect(container.querySelector('[data-dimmed]')).toBeNull()
    play()
    const lit = new Set(walk.steps[0]!.highlight)
    const parts = example.components.map((c) => c.id)
    const marked = [...container.querySelectorAll<HTMLElement>('[data-id]')]
      .filter((el) => parts.includes(el.dataset.id ?? ''))
    expect(marked.length).toBe(parts.length)
    for (const el of marked) {
      const card = el.querySelector('[data-highlighted], [data-dimmed]')
      if (lit.has(el.dataset.id ?? '')) expect(card).toHaveAttribute('data-highlighted', 'true')
      else expect(card).toHaveAttribute('data-dimmed', 'true')
    }
    fireEvent.click(within(bar()).getByRole('button', { name: 'Next' }))
    const next = new Set(walk.steps[1]!.highlight)
    for (const el of marked) {
      const card = el.querySelector('[data-highlighted], [data-dimmed]')
      expect(card?.hasAttribute('data-highlighted')).toBe(next.has(el.dataset.id ?? ''))
    }
    fireEvent.click(within(bar()).getByRole('button', { name: 'Close' }))
    expect(container.querySelector('[data-highlighted]')).toBeNull()
  })
})

describe('lessons in the inspector', () => {
  it('offers the lesson for Approval and opens it, then returns focus to the button', async () => {
    render(<App />)
    loadExample()
    const approval = example.components.find((c) => c.lesson)!
    const panel = screen.getByTestId('inspector')
    fireEvent.click(within(panel).getAllByRole('button', { name: new RegExp(`^${approval.label}`) })[0]!)
    expect(within(panel).getByRole('heading', { name: 'Interactive lesson' })).toBeInTheDocument()
    expect(within(panel).getByText('Teaching model')).toBeInTheDocument()
    const open = within(panel).getByRole('button', { name: 'Open lesson' })
    open.focus()
    fireEvent.click(open)
    const dialog = await screen.findByRole('dialog', { name: 'Approval gate', hidden: true })
    expect(dialog).toBeInTheDocument()
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
    // Escape inside the dialog closes only the dialog. The part stays selected.
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Escape' })
      fireEvent(dialog, new Event('cancel', { cancelable: true }))
    })
    expect(screen.queryByRole('dialog', { name: 'Approval gate', hidden: true })).not.toBeInTheDocument()
    expect(within(panel).getByRole('heading', { name: approval.label })).toBeInTheDocument()
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Open lesson' })).toHaveFocus())
  })

  it('shows no lesson section for a part without one', () => {
    render(<App />)
    loadExample()
    const plain = example.components.find((c) => !c.lesson)!
    const panel = screen.getByTestId('inspector')
    fireEvent.click(within(panel).getAllByRole('button', { name: new RegExp(`^${plain.label}`) })[0]!)
    expect(within(panel).queryByText('Interactive lesson')).not.toBeInTheDocument()
  })
})

describe('Escape on the map', () => {
  it('gives focus back to the card that was focused when the inspector button disappears', async () => {
    const { container } = render(<App />)
    loadExample()
    const card = container.querySelector<HTMLElement>('.react-flow__node[data-id="preview"]')
    expect(card).not.toBeNull()
    card!.focus()
    fireEvent.focus(card!)
    const panel = screen.getByTestId('inspector')
    const row = within(panel).getAllByRole('button', { name: /^Approval/ })[0]!
    row.focus()
    fireEvent.click(row)
    const back = within(panel).getByRole('button', { name: /Board overview/ })
    back.focus()
    fireEvent.keyDown(back, { key: 'Escape' })
    await waitFor(() => expect(within(panel).getByRole('heading', { name: /Example/ })).toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))
    expect(card).toHaveFocus()
  })

  it('falls back to the panel heading when no map element had focus', async () => {
    render(<App />)
    loadExample()
    const panel = screen.getByTestId('inspector')
    const row = within(panel).getAllByRole('button', { name: /^Approval/ })[0]!
    row.focus()
    fireEvent.click(row)
    const back = within(panel).getByRole('button', { name: /Board overview/ })
    back.focus()
    fireEvent.keyDown(back, { key: 'Escape' })
    await waitFor(() => expect(within(panel).getByRole('heading', { name: /Example/ })).toHaveFocus())
  })
})
