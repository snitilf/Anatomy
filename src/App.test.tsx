import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('shows the empty state when no board is open', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Anatomy' })).toBeInTheDocument()
    expect(screen.getByText('No board is open.')).toBeInTheDocument()
  })
})
