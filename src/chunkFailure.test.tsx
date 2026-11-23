import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import refundRaw from '../e2e/fixtures/refund-approval.board.json?raw'
import App from './App'
import { openBoardFile } from './test/openFile'
import { press } from './test/press'

// A script that cannot load, as when the local server has stopped.
vi.mock('./canvas/Canvas', () => {
  throw new Error('Failed to fetch dynamically imported module')
})
vi.mock('./app/HowToDialog', () => {
  throw new Error('Failed to fetch dynamically imported module')
})

describe('a script that fails to load', () => {
  it('leaves the rest of the app working when the map cannot load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<App />)
    openBoardFile(refundRaw, 'refund-approval.board.json')
    expect(await screen.findByTestId('inspector')).toBeInTheDocument()
    expect(await screen.findByText('The map could not load.')).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByRole('button', { name: /Refund approval/ })).toBeInTheDocument()
  })

  it('says so when the how-to dialog cannot load, and the app stays', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<App />)
    press(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'How to make a board' }))
    expect(await screen.findByText('The dialog could not load.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Open a repository to see its anatomy.' })).toBeInTheDocument())
  })
})
