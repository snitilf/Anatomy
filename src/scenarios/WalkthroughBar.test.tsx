import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import App from '../App'
import refundRaw from '../../e2e/fixtures/refund-approval.board.json?raw'
import { openPart } from '../test/openOnMap'
import { openBoardFile } from '../test/openFile'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

const refund = JSON.parse(refundRaw) as {
  scenarios: { id: string; title: string; steps: { caption: string; highlight: string[] }[] }[]
  components: { id: string; label: string; lesson?: string }[]
}
const walk = refund.scenarios[0]!

async function loadRefund() {
  openBoardFile(refundRaw, 'refund-approval.board.json')
  await screen.findByTestId('inspector')
  // The map loads on its own script, a moment after the sidebar.
  await waitFor(() => expect(document.querySelector('.react-flow__node-card')).not.toBeNull())
}

function play() {
  const button = screen.getByRole('button', { name: `Play ${walk.title}` })
  button.focus()
  fireEvent.click(button)
  return button
}

const bar = () => screen.getByRole('region', { name: `Walkthrough: ${walk.title}` })

describe('walkthroughs', () => {
  it('lists the walkthroughs in the overview, with a step count', async () => {
    render(<App />)
    await loadRefund()
    const panel = screen.getByTestId('inspector')
    expect(within(panel).getByRole('heading', { name: /^Walkthroughs/ })).toBeInTheDocument()
    for (const s of refund.scenarios) expect(within(panel).getByText(s.title)).toBeInTheDocument()
    expect(within(panel).getByText(`${walk.steps.length} steps`)).toBeInTheDocument()
  })

  it('plays from the overview and shows step 1 with its caption', async () => {
    render(<App />)
    await loadRefund()
    play()
    const player = within(bar())
    expect(player.getByText(`Step 1 of ${walk.steps.length}`)).toBeInTheDocument()
    expect(player.getByText(walk.steps[0]!.caption)).toBeInTheDocument()
    expect(player.getByText(walk.steps[0]!.caption)).toHaveAttribute('aria-live', 'polite')
    // The controls name their keys in their tooltips, and Previous is off at the first step.
    expect(player.getByRole('button', { name: 'Previous' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('says in one quiet line that it is a teaching sequence and nothing runs, on every step', async () => {
    render(<App />)
    await loadRefund()
    play()
    const player = within(bar())
    const line = player.getByText('Teaching sequence. Nothing runs.')
    // One line of its own: not part of the caption that a screen reader announces at each step.
    expect(line.tagName).toBe('P')
    expect(line).not.toHaveAttribute('aria-live')
    expect(player.getByText(walk.steps[0]!.caption)).not.toContainElement(line)
    fireEvent.click(player.getByRole('button', { name: 'Next' }))
    expect(player.getByText('Teaching sequence. Nothing runs.')).toBeInTheDocument()
    // The line shows only while a walkthrough plays.
    fireEvent.click(player.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Teaching sequence. Nothing runs.')).not.toBeInTheDocument()
  })

  it('moves with Next, Previous, and the arrow keys, and stops at both ends', async () => {
    render(<App />)
    await loadRefund()
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
    await loadRefund()
    const button = play()
    await waitFor(() => expect(bar().contains(document.activeElement)).toBe(true))
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: /^Walkthrough:/ })).not.toBeInTheDocument()
    await waitFor(() => expect(button).toHaveFocus())
  })

  it('keeps the tooltip shut for the focus that starts a walkthrough, and shows it for a later keyboard focus', async () => {
    render(<App />)
    await loadRefund()
    play()
    const next = within(bar()).getByRole('button', { name: 'Next' })
    await waitFor(() => expect(next).toHaveFocus())
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    // The same button, focused later from the keyboard, shows its tooltip.
    act(() => next.blur())
    fireEvent.keyDown(document.body, { key: 'Shift' })
    act(() => next.focus())
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Next')
  })

  it('closes from the Close button', async () => {
    render(<App />)
    await loadRefund()
    play()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: /^Walkthrough:/ })).not.toBeInTheDocument()
  })

  it('marks the highlighted parts and dims the others', async () => {
    const { container } = render(<App />)
    await loadRefund()
    expect(container.querySelector('[data-highlighted]')).toBeNull()
    expect(container.querySelector('[data-dimmed]')).toBeNull()
    play()
    const lit = new Set(walk.steps[0]!.highlight)
    const parts = refund.components.map((c) => c.id)
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

describe('lessons in the sidebar', () => {
  it('offers the lesson for Approval and opens it, then returns focus to the button', async () => {
    render(<App />)
    await loadRefund()
    const approval = refund.components.find((c) => c.lesson)!
    const panel = screen.getByTestId('inspector')
    openPart(approval.label)
    expect(within(panel).getByRole('heading', { name: 'Lesson' })).toBeInTheDocument()
    const open = within(panel).getByRole('button', { name: /^Approval gate/ })
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
    await waitFor(() => expect(within(panel).getByRole('button', { name: /^Approval gate/ })).toHaveFocus())
  })

  it('shows no lesson section for a part without one', async () => {
    render(<App />)
    await loadRefund()
    const plain = refund.components.find((c) => !c.lesson)!
    const panel = screen.getByTestId('inspector')
    openPart(plain.label)
    expect(within(panel).queryByRole('heading', { name: 'Lesson' })).not.toBeInTheDocument()
  })
})

describe('Escape on the map', () => {
  it('gives focus back to the card that was focused when the sidebar button disappears', async () => {
    const { container } = render(<App />)
    await loadRefund()
    const card = container.querySelector<HTMLElement>('.react-flow__node[data-id="payout-preview"]')
    expect(card).not.toBeNull()
    card!.focus()
    fireEvent.focus(card!)
    const panel = screen.getByTestId('inspector')
    openPart(/^Manager approval/)
    const back = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('button', { name: /Refund approval/ })
    back.focus()
    fireEvent.keyDown(back, { key: 'Escape' })
    await waitFor(() => expect(within(panel).getByRole('heading', { name: /Refund approval/ })).toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))
    expect(card).toHaveFocus()
  })

  it('falls back to the panel heading when no map element had focus', async () => {
    render(<App />)
    await loadRefund()
    const panel = screen.getByTestId('inspector')
    openPart(/^Manager approval/)
    const back = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('button', { name: /Refund approval/ })
    back.focus()
    fireEvent.keyDown(back, { key: 'Escape' })
    await waitFor(() => expect(within(panel).getByRole('heading', { name: /Refund approval/ })).toHaveFocus())
  })
})
