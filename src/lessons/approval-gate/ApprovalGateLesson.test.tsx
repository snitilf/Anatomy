import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import ApprovalGateLesson from './ApprovalGateLesson'

const realMatchMedia = window.matchMedia

/** Reduced motion makes every pose settle on the next frame, so a test reads the end pose without waiting. */
function stillMotion() {
  window.matchMedia = (query: string) =>
    ({ matches: query.includes('prefers-reduced-motion'), media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList
}

const frame = () => act(async () => void (await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))))

const poseOf = (part: string, slot: number) => document.querySelector(`[data-part="${part}"][data-slot="${slot}"]`)?.getAttribute('data-pose')
const poses = (part: string) => Array.from({ length: 8 }, (_, i) => poseOf(part, i + 1))
const press = async (name: RegExp) => {
  fireEvent.click(screen.getByRole('button', { name }))
  await frame()
}

describe('ApprovalGateLesson', () => {
  it('shows the limits and the analogy map', () => {
    render(<ApprovalGateLesson />)
    expect(screen.getByText('Where the analogy stops')).toBeInTheDocument()
    expect(screen.getAllByRole('term')).toHaveLength(3)
  })

  it('follows the model through the buttons and keys', () => {
    render(<ApprovalGateLesson />)
    expect(screen.getByText('v1 undecided · sent none')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }))
    expect(screen.getByText('v1 approved · sent none')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('group', { name: 'Approval gate lesson' }), { key: 'e' })
    expect(screen.getByText('v2 undecided · old key v1 · sent none')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reset lesson/ }))
    expect(screen.getByText('v1 undecided · sent none')).toBeInTheDocument()
  })

  it('announces the outcome in a polite live region', async () => {
    render(<ApprovalGateLesson />)
    fireEvent.click(screen.getByRole('button', { name: /Send/ }))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120))
    })
    expect(screen.getByRole('status')).toHaveTextContent('Nobody approved version 1')
  })

  describe('the moving parts follow the model', () => {
    beforeEach(stillMotion)
    afterEach(() => {
      window.matchMedia = realMatchMedia
    })

    it('starts with every finger down and every pin up, pin 8 included', async () => {
      render(<ApprovalGateLesson />)
      await frame()
      expect(poses('finger')).toEqual(Array(8).fill('down'))
      expect(poses('pin')).toEqual(Array(8).fill('up'))
    })

    it('lifts the finger of the approved version and no other', async () => {
      render(<ApprovalGateLesson />)
      await press(/Approve/)
      expect(poses('finger')).toEqual(['up', ...Array(7).fill('down')])
    })

    it('moves the key and the lifted finger to version 2 after an edit and a new approval', async () => {
      render(<ApprovalGateLesson />)
      await press(/Approve/)
      await press(/Edit message/)
      await press(/Approve/)
      expect(poses('finger')).toEqual(['down', 'up', ...Array(6).fill('down')])
      const shown = document.querySelectorAll('[data-part="key"][data-pose="shown"]')
      expect(shown).toHaveLength(1)
      expect(shown[0]?.getAttribute('data-slot')).toBe('2')
    })

    it('drops the pin of the version that went out and keeps the others up', async () => {
      render(<ApprovalGateLesson />)
      await press(/Approve/)
      await press(/Edit message/)
      await press(/Approve/)
      await press(/Send/)
      expect(poses('pin')).toEqual(['up', 'down', ...Array(6).fill('up')])
    })
  })
})
