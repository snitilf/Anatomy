import { render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import App from '../App'
import { EXAMPLES } from './examples'

vi.mock('./ExamplePreview', () => {
  throw new Error('The script could not load.')
})

it('keeps the examples and the steps when the map previews cannot load', async () => {
  render(<App />)
  const main = within(screen.getByRole('main'))
  for (const example of EXAMPLES) {
    expect(await main.findByRole('button', { name: example.title })).toBeVisible()
  }
  expect(main.getByTestId('start-steps')).toBeVisible()
  expect(main.getByRole('heading', { name: 'Open a repository to see its anatomy.' })).toBeVisible()
  expect(main.queryByRole('alert')).toBeNull()
})
