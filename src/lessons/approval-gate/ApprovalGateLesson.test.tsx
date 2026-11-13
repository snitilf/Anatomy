import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ApprovalGateLesson from './ApprovalGateLesson'

describe('ApprovalGateLesson', () => {
  it('shows the limits and the analogy map', () => {
    render(<ApprovalGateLesson />)
    expect(screen.getByText('Teaching model, not live execution')).toBeInTheDocument()
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
})
